# Recipe flow diagrams — working notes for Claude

A Next.js app that turns a recipe (URL, photo, or pasted text) into a
"merge-box" flow diagram, plus an interactive checklist you can cook from.

## Where this came from — read before changing rendering

This is Phase 2 of a two-phase project. Phase 1 was a Claude skill that did the
same extraction and rendered a static SVG with a Python script. That script is
kept verbatim at `verify/render_recipe_diagram.py` **as a test baseline only** —
the app does not use it.

`src/lib/svg.ts` is a deliberate line-by-line port of that script. `npm run
parity` renders all five test recipes through both and compares them pixel by
pixel. **All five must stay pixel-identical.** If a change makes parity fail,
that is either a bug or a divergence that needs recording in
`docs/phase2-notes.md` — never silently accepted.

`docs/phase2-notes.md` records what was ported, what changed on purpose, and how
the open design questions were settled. Read it before proposing a redesign of
anything; most of it has already been decided and validated.

## Commands

```bash
npm run dev            # local dev server
npm run demo           # links that open the app on sample recipes, no API key
npm run parity         # static output vs the Phase 1 Python renderer
npm run verify:cook    # cook-mode behaviour in a real browser (needs npm start)
npm run shots          # screenshots of every fixture in every view
```

Before committing anything that touches layout, rendering, or cook mode, run
`npm run parity` and `npm run verify:cook`. Both are fast and both catch real
regressions.

## The algorithm

Three rules produce the whole diagram, and they are not negotiable:

- each ingredient is a row, in list order
- a step's **column** = 1 + max(column of its inputs); ingredients are column 0
- a step's **row span** = union of its inputs' row spans (min top .. max bottom)

Consequence worth internalising: because a step's box is one rectangle from its
topmost to its bottommost input row, every ingredient in that vertical range
reads as part of the box. So **each step's inputs must occupy a contiguous run
of ingredient rows**. `computeLayout` checks this and emits a
`noncontiguous_inputs` warning naming the offending rows. The fix is almost
always reordering ingredients, not changing the merge structure.

## Layout metrics

`src/lib/layout.ts` exports two metric sets:

- `C` — Phase 1's numbers. The static SVG **always** renders with these;
  `buildSvg` ignores any layout passed to it that wasn't built with `C`.
- `COMPACT_METRICS` — tighter columns for cook mode on phone-width screens.

Never make the static export depend on viewport. That separation is what keeps
parity true regardless of what screen the user is on.

## Architecture

```
src/lib/layout.ts        the algorithm above + group colours + validation
src/lib/svg.ts           static renderer (the Phase 1 port)
src/lib/units.ts         display-only unit toggle; never rewrites the recipe
src/lib/share.ts         recipe <-> gzipped URL fragment
src/lib/storage.ts       localStorage: cook progress, recent recipes
src/lib/fetchRecipe.ts   URL fetch, schema.org/Recipe JSON-LD preferred
src/lib/extractPrompt.ts the Phase 1 SKILL.md instructions, for one API call
src/app/api/extract/     server-side Claude call + rate limit + repair pass

src/components/CookMode.tsx       interactive checklist
src/components/StaticDiagram.tsx  exportable diagram, SVG/PNG download
src/components/Editor.tsx         fix extraction before rendering
src/components/Warnings.tsx       surfaces layout warnings in the UI
```

## Constraints that are not style choices

- **Max 3 ingredient groups.** Beyond three the palette fails colour-vision
  deficiency checks. The app turns colour coding off entirely and explains why
  rather than rendering something unreadable. Don't raise the cap.
- **Group colours are assigned in fixed first-seen order** from
  `GROUP_COLOR_ORDER`. Never hand-pick per recipe.
- **Quantities render exactly as sourced by default.** The unit toggle is
  display-only, and conversion is skipped rather than guessed for ranges and
  parenthetical package sizes.
- **Divider banners draw before step boxes, and box fills are fully opaque**, so
  a merge box spanning a divider masks it cleanly. Reordering these re-breaks a
  bug that was already fixed once.
- **A column collapses only when every step sharing it is done.** Two
  independent branches can land in the same column by coincidence; the tofu
  fixture is exactly this case and `verify:cook` asserts it.

## Cook mode

Ported from an approved prototype. Absolutely-positioned elements, a column
offset function recomputed on each toggle, CSS transitions on `left`/`width`.
Animating CSS Grid track sizes was considered and rejected — don't reach for it.

Ingredient rows fade and strike through the moment their consuming step is
checked, before that step's column collapses. That immediacy is the thing that
makes it feel like a checklist rather than a progress bar.

## Extraction

`src/lib/extractPrompt.ts` is the highest-leverage file in the repo. Almost
every "the diagram is wrong" report is an extraction problem, not a rendering
one. The API route runs one automatic repair pass: if the result trips the
contiguity check or references an unknown input, the warnings are fed back and
it retries once, keeping the repair only if it produces fewer problems.

When a recipe extracts badly: fix it in the Edit tab, work out what the model
missed, tighten the prompt, then save the corrected JSON to `fixtures/` so both
verification scripts and the `/demo` page pick it up automatically.

## Conventions

- TypeScript, strict. No `any` without a reason in a comment.
- Styling is `styled-jsx` blocks inside components; shared bits in
  `src/app/globals.css`. No CSS framework — don't add one.
- Comments explain *why*, especially where a choice encodes a constraint from
  Phase 1. Keep that habit; it's what makes the parity requirement legible.
- No new dependencies without asking. The runtime deps are Next, React, and the
  Anthropic SDK, and it's worth keeping it that way.

## Known limits

- A component split and reused in two places (half the dough as base, half
  crumbled on top) doesn't fit the merge-tree model. Extraction is told to flag
  it in `notes` rather than force a bad diagram.
- The rate limit is in-memory: it resets on cold start and isn't shared across
  serverless instances. Fine as a bill guard, not a security control.
- Share links carry the whole recipe in the fragment. Long recipes make long
  links, and some chat apps truncate them.
