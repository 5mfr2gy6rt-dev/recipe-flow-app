import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { EXTRACTION_SYSTEM_PROMPT, RECIPE_TOOL } from "@/lib/extractPrompt";
import { fetchRecipeFromUrl } from "@/lib/fetchRecipe";
import { computeLayout } from "@/lib/layout";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import type { Recipe, Warning } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sonnet 5 is the speed/intelligence sweet spot for this job and handles the
// photo path (all current models are vision-capable). Override with
// ANTHROPIC_MODEL if you want Opus 5 for tricky handwritten recipes.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Body = {
  mode: "url" | "text" | "photo";
  url?: string;
  text?: string;
  image?: { data: string; media_type: string };
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return bad(
      "The server has no ANTHROPIC_API_KEY set. Add one to .env.local (or your host's environment) and restart.",
      500,
    );
  }

  const limit = checkRateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Rate limit reached. Try again in about ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} minutes.`,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Malformed request body.");
  }

  // --- assemble the model input ------------------------------------------
  const content: Anthropic.MessageParam["content"] = [];
  let sourceInfo: Recipe["source"];

  try {
    if (body.mode === "url") {
      if (!body.url?.trim()) return bad("No URL given.");
      const fetched = await fetchRecipeFromUrl(body.url.trim());
      sourceInfo = { kind: "url", url: body.url.trim() };
      content.push({
        type: "text",
        text:
          fetched.via === "json-ld"
            ? `Here is a recipe taken from that page's structured data.\n\n${fetched.text}`
            : `Here is the visible text of a recipe page. It contains navigation and comment clutter — pull out only the recipe itself.\n\n${fetched.text}`,
      });
    } else if (body.mode === "text") {
      const text = body.text?.trim();
      if (!text) return bad("No recipe text given.");
      if (text.length > 40_000) return bad("That text is too long.");
      sourceInfo = { kind: "text" };
      content.push({ type: "text", text: `Here is a recipe:\n\n${text}` });
    } else if (body.mode === "photo") {
      const img = body.image;
      if (!img?.data) return bad("No image given.");
      if (!/^image\/(png|jpeg|webp|gif)$/.test(img.media_type)) {
        return bad("Images must be PNG, JPEG, WebP or GIF.");
      }
      if (img.data.length * 0.75 > MAX_IMAGE_BYTES) {
        return bad("That image is larger than 5 MB.");
      }
      sourceInfo = { kind: "photo" };
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type as "image/png",
          data: img.data,
        },
      });
      content.push({
        type: "text",
        text: "Read the recipe in this image — typed, printed or handwritten — and structure it.",
      });
    } else {
      return bad("Unknown mode.");
    }
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Couldn't read that recipe.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];

  async function callModel(): Promise<Recipe & { notes?: string }> {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [RECIPE_TOOL as Anthropic.Tool],
      tool_choice: { type: "tool", name: RECIPE_TOOL.name },
      messages,
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("The model didn't return a structured recipe.");
    }
    messages.push({ role: "assistant", content: res.content });
    return block.input as Recipe & { notes?: string };
  }

  try {
    let recipe = await callModel();
    let layout = computeLayout({ ...recipe, source: sourceInfo });

    // One automatic repair pass. The ordering constraint is easy for a model to
    // get slightly wrong and easy to describe precisely, so it's worth the
    // second call before handing the problem to the user.
    const repairable = layout.warnings.filter(
      (w) =>
        w.code === "noncontiguous_inputs" ||
        w.code === "unknown_input" ||
        w.code === "forward_reference" ||
        w.code === "too_many_groups" ||
        w.code === "divider_mismatch",
    );
    if (repairable.length) {
      const toolUseId = (
        (messages.at(-1)!.content as Anthropic.ContentBlock[]).find(
          (b) => b.type === "tool_use",
        ) as Anthropic.ToolUseBlock
      ).id;
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: `The diagram layout rejected that structure:\n\n${repairable
              .map((w) => `- ${w.message}`)
              .join(
                "\n",
              )}\n\nFix it and call emit_recipe again with the corrected recipe. Keep the same merge logic — usually the fix is reordering the ingredients so each step's inputs sit together, not changing which ingredients combine.`,
          },
        ],
      });
      const repaired = await callModel();
      const repairedLayout = computeLayout({ ...repaired, source: sourceInfo });
      // Only keep the repair if it actually improved things.
      const before = layout.warnings.filter((w) => w.level === "error").length +
        layout.warnings.length;
      const after =
        repairedLayout.warnings.filter((w) => w.level === "error").length +
        repairedLayout.warnings.length;
      if (after < before) {
        recipe = repaired;
        layout = repairedLayout;
      }
    }

    const warnings: Warning[] = layout.warnings;
    return NextResponse.json({
      recipe: { ...recipe, source: sourceInfo },
      warnings,
      notes: recipe.notes || "",
      remaining: limit.remaining,
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `The Claude API returned ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Extraction failed.";
    return bad(message, 502);
  }
}
