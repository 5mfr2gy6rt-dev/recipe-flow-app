/**
 * The extraction prompt. This is the Phase 1 SKILL.md instructions — the schema,
 * the merge-inference rules, the ingredient-ordering constraint, and the
 * grouping/divider rules — restated for a single API call. Keeping it aligned
 * with SKILL.md is the whole point: the skill and the app should infer the same
 * merge structure from the same recipe.
 */

import { MAX_GROUPS } from "./layout";

export const EXTRACTION_SYSTEM_PROMPT = `You convert recipes into a structured merge-tree used to draw a "merge-box" flow diagram: ingredients are rows on the left, prep steps are full-width header rows, and boxes span the rows they combine, narrowing left-to-right into one final box.

The diagram is only useful if it reflects WHEN ingredients get combined, not just a flat ingredient list beside a flat step list. A reader should be able to trace with their eyes which ingredients hit the bowl together, and in what order.

## Working out the merge structure (the part that actually matters)

Read the instructions' verbs and ordering to decide which ingredients combine at which point:

- "combine/cream/whisk together X, Y and Z" -> one step with inputs [X, Y, Z].
- "add A" / "beat in A" / "stir in A" after an earlier combined step -> a NEW step whose inputs are [previous_step_id, A]. This produces the descending staircase seen in a lot of real recipes (cream the wet ingredients, beat in the egg, mix in the flour, fold in the chips — one addition at a time). Do not collapse a staircase into a single step.
- Components made SEPARATELY (a crust mixed and pre-baked while a filling is whisked on the side; a breading and a sauce prepared independently) stay as their own chain of steps until an instruction actually combines them. At that point create a step whose inputs are the ids of both branches. Two branches that never overlap in ingredient rows can safely share a column, so do not try to offset them manually.
- A step inherits everything its inputs already contain, so never re-list an ingredient that an earlier step already folded in.
- If a recipe genuinely has no merge points (everything goes in the pot at once), that is fine: one step taking every ingredient, then the cooking step.
- The final step is whatever finishes the recipe — bake, simmer, pressure cook, sauté, chill, or just "serve". Do not assume baking.
- Keep "action" short but complete. Baking verbs are often one or two words ("fold in", "cream"); stovetop instructions are usually phrases ("add tomato, spices, chickpeas & water"). Write the phrase if the phrase is what is happening, but keep it under about 45 characters.
- Put temperature/time in "params" ({"temp": "350°F", "time": "30-40 min"}), not in the action text.
- prep_steps are only the things that depend on no ingredients at all: preheating, greasing a pan, lining a sheet, setting up a steamer.

## Ingredient ORDER matters — inputs must be contiguous

A step's box is drawn as one rectangle from its topmost input row to its bottommost input row, so every ingredient in that vertical range reads as part of the box even if it is not an input. Order the ingredients list so that each sub-mixture's members sit together as one contiguous block (all the sauce ingredients together, all the crust ingredients together), rather than in whatever order the source happened to mention them. Garnishes added at the very end belong at the bottom.

Check your own output before returning it: for every step, the set of ingredient rows it transitively covers must be a contiguous run. If it is not, reorder the ingredients until it is.

## Quantities

Preserve quantities exactly as written in the source, including mixed imperial/metric like "4 oz (115 g)" — do not normalise or convert them in the "quantity" field. Optionally also fill "quantity_imperial" and "quantity_metric" with a clean conversion when one is unambiguous (weights and volumes with a plain number and unit); leave them out for things like "1 (16 oz) package", "2-3 large", or "to garnish".

## Groups and dividers — only when the recipe genuinely uses separate bowls

Most recipes need NONE of this and should render plain, with no colour and no legend. Use it only when the recipe truly prepares something in a separate bowl/pan before combining: a sauce whisked on the side, a crust made before a filling, a marinade prepared separately.

When it applies:
- Tag every ingredient of one bowl with "group": "<short-name>" and the other bowl's with a different short name ("breading"/"sauce", "crust"/"filling"). Group names appear in a legend, so keep them short and human-readable.
- Add a "dividers" entry marking where the next bowl's ingredients begin: {"before_id": "<first ingredient id of that bowl>", "label": "Medium bowl — sauce", "group": "sauce"}. The divider and the group boundary describe the same place, so they must line up with the contiguous block.
- Never use more than ${MAX_GROUPS} groups. Beyond that the colours stop being reliably distinguishable for colourblind readers, and the app will refuse to colour the diagram at all. If a recipe seems to want more, merge the smaller ones.

## Things to flag rather than force

If a component gets split and reused in two places (half the dough as the base, half crumbled on top), the pure merge-tree model cannot represent it. Produce the best diagram you can and explain the problem in "notes".

Return your answer only by calling the emit_recipe tool.`;

export const RECIPE_TOOL = {
  name: "emit_recipe",
  description:
    "Return the structured recipe merge-tree that the flow diagram is drawn from.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Recipe title." },
      prep_steps: {
        type: "array",
        items: { type: "string" },
        description:
          "Steps that depend on no ingredients (preheat, grease a pan). May be empty.",
      },
      ingredients: {
        type: "array",
        description:
          "Ingredients in an order that keeps every step's inputs contiguous.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Short unique slug, referenced by steps[].inputs.",
            },
            name: { type: "string" },
            quantity: {
              type: "string",
              description: "Exactly as written in the source.",
            },
            quantity_imperial: {
              type: "string",
              description: "Optional clean imperial conversion.",
            },
            quantity_metric: {
              type: "string",
              description: "Optional clean metric conversion.",
            },
            group: {
              type: "string",
              description:
                "Only when the recipe genuinely uses a separate bowl for this set.",
            },
          },
          required: ["id", "name"],
        },
      },
      dividers: {
        type: "array",
        description: "Optional banner rows marking where a new bowl starts.",
        items: {
          type: "object",
          properties: {
            before_id: { type: "string" },
            label: { type: "string" },
            group: { type: "string" },
          },
          required: ["before_id", "label"],
        },
      },
      steps: {
        type: "array",
        description: "In the order they happen. Inputs must already exist.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            action: { type: "string" },
            inputs: {
              type: "array",
              items: { type: "string" },
              description:
                "Ingredient ids, or ids of EARLIER steps whose output is combined further.",
            },
            params: {
              type: "object",
              properties: {
                temp: { type: "string" },
                time: { type: "string" },
                pan: { type: "string" },
              },
            },
          },
          required: ["id", "action", "inputs"],
        },
      },
      notes: {
        type: "string",
        description:
          "Anything the diagram cannot represent faithfully, or an empty string.",
      },
    },
    required: ["title", "prep_steps", "ingredients", "steps"],
  },
};
