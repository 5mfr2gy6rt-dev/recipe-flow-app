# Phase 2 web app — what was ported, and how it compares to Phase 1

Status: built and locally runnable. Not deployed — that needs your Vercel
account and your Claude API key.

## Static output vs. the Phase 1 skill

**Pixel-identical on all five test recipes.**

`src/lib/svg.ts` is a direct port of `render_recipe_diagram.py` — same
constants, same draw order, same text-placement arithmetic. `npm run parity`
renders each fixture through both the original Python script (kept verbatim at
`verify/render_recipe_diagram.py` as the baseline) and the TypeScript port,
rasterises both in Chromium, and diffs them:

| Recipe | What it exercises | Result |
| --- | --- | --- |
| Fudgy brownies | the reference-photo shape, mixed imperial/metric quantities | identical |
| Lemon bars | branching crust + filling, group colours, divider row | identical |
| Chocolate chip cookies | long staircase of sequential additions | identical |
| Crispy honey-garlic tofu | two independent branches, gradient merge box | identical |
| Punjabi chole | long sequential build, wrapped phrase labels | identical |

Zero differing pixels in every case, at identical canvas dimensions. Two things
protect that going forward: the check is a one-command script, and `buildSvg`
ignores any layout handed to it that wasn't built with Phase 1's metrics, so a
phone-sized cook-mode layout can never leak into an export.

The only intentional divergence is the unit toggle. With units set to
"As written" — the default, and what parity is measured at — output is
byte-for-byte the Phase 1 behaviour of preserving quantities exactly as sourced.
Switching to Imperial or Metric is display-only and never rewrites the recipe.

## Interactive checklist vs. the approved prototype

**Behaviour matches.** The mechanics are unchanged from
`phase2-checklist-prototype.html`: absolutely-positioned elements, a column
offset function recomputed on each toggle, and CSS transitions on `left`/`width`.
Grid track animation was not attempted, for the reason the prototype gave.

`npm run verify:cook` drives the real app in a browser and asserts:

- a column holding **two** steps (honey-garlic tofu puts the breading and sauce
  branches in the same columns) does **not** collapse when only one is checked
- it collapses once **both** are checked, and the board narrows by exactly one
  column's worth (168 → 54 px)
- columns to the right slide left by that same amount
- unchecking one step re-expands the column
- a column holding **one** step collapses as soon as it is checked
- ingredient rows fade and strike through the moment their consuming step is
  checked — before that step's column collapses
- ingredients belonging to unchecked steps stay solid
- every column collapses once the whole recipe is done
- checked steps survive a page reload

All thirteen checks pass.

## Rough edges from the prototype, now fixed

- **Divider label clipping.** The banner label now shrinks with the available
  width (15px down to a 9px floor) and then truncates with an ellipsis plus a
  hover tooltip carrying the full text. Verified with a deliberately long label
  at fully-collapsed width: 15px → 10px, no overflow.
- **Step-label wrapping.** Handled in CSS (`white-space: normal` +
  `overflow-wrap: anywhere`) rather than the manual `wrap_text()` the SVG needs,
  so cooking phrases wrap naturally instead of overlapping neighbours.
- **Divider z-order.** Banners draw before step boxes, and box fills are fully
  opaque, so a merge box crossing a banner paints cleanly over it.

## Things that changed on purpose

- **The contiguity check is now visible.** Phase 1 printed a `WARNING` to stderr
  where a developer would see it. Here it surfaces in the interface, names the
  offending ingredients in plain language, and recomputes live as you edit — a
  box drawn silently around the wrong ingredients is worse than no diagram.
- **The group cap is enforced, not just documented.** More than three groups
  turns colour coding off entirely and explains why, rather than rendering a
  palette that fails CVD checks.
- **Extraction gets one repair pass.** If the first result trips the contiguity
  check or references an unknown input, the warnings are fed back and it tries
  once more; the repair is kept only if it produces fewer problems.
- **Cook mode is responsive.** A 300px ingredient column swallowed a phone
  viewport whole, leaving the steps offscreen — which defeats the point. Narrow
  screens get tighter columns, and there's a fit-to-width control that scales
  the board without touching the layout maths.

## Open questions — how they were settled

- **Unit normalisation:** a display toggle (source / imperial / metric).
  Source is the default and stays verbatim. Conversion is skipped rather than
  guessed for ranges and parenthetical package sizes ("1 (16 oz) package",
  "2-3 large"). Oven temperatures convert in both step boxes and prep headers,
  so the two can't contradict each other.
- **Progress persistence:** yes, `localStorage`, keyed by a hash of the recipe's
  title and step shape — so editing the merge structure correctly starts a fresh
  checklist. Recently generated recipes are also stored locally so they can be
  reopened without paying for another extraction.
- **Shareable cook-mode link:** yes. The recipe is gzipped into the URL
  fragment, so sharing needs no database and the recipe never reaches the
  server. Long recipes make long links; some chat apps will truncate them.
- **Rate limiting / auth:** an in-memory per-IP hourly limit (default 20),
  no auth. Enough to stop a public URL running up a bill; move it to KV before
  it sees real traffic.

## Trying it without a key

`npm run demo` prints a link per test recipe that opens the app on that recipe
with no extraction call — the recipe travels in the URL fragment, the same
mechanism the share button uses. Everything except the three input modes works
from there. The home page now accepts a recipe fragment too, not just `/cook`,
so a shared link can open into the full set of views rather than cook mode
alone.

## Not built

- Deployment. Needs your accounts.
- Live extraction has not been exercised end to end — there is no API key in
  this environment, so the URL/photo/text paths are structurally complete and
  error-handled but unproven against the real model. That is the first thing to
  test once a key is in place: run the same five recipes through the app and
  confirm the extracted JSON matches Phase 1's.
