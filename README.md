# Recipe flow diagrams — Phase 2 web app

Paste a recipe URL, upload a photo, or paste text, and get back the "merge-box"
flow diagram from Phase 1 — plus an interactive checklist you can cook from.

The extraction schema, the merge-inference rules, the layout algorithm and the
collapse behaviour are all ported from Phase 1 rather than redesigned. See
`docs/phase2-notes.md` for what was carried over and how the output compares.

## Running it

```bash
npm install
cp .env.example .env.local     # then put your Claude API key in it
npm run dev                    # http://localhost:3000
```

The API key stays server-side; it is only read inside `src/app/api/extract`.

### Trying it without an API key

Start the server and open **http://localhost:3000/demo**, or click "Try a sample
recipe" on the home page. Five built-in recipes — the Phase 1 test set — open
with no extraction call.

`npm run demo` does the same thing from the command line, printing a link per
recipe that opens the app on that recipe with no extraction call — the recipe rides in the URL fragment, the same mechanism the
share button uses. Everything except the three input modes works from there:
both views, editing, the unit toggle, SVG and PNG download.

`npm run parity` also writes standalone SVGs for all five recipes to
`verify/out/app/`, which open in any browser with no server at all.

### Deploying

Any Next.js host works. On Vercel: import the repo, set `ANTHROPIC_API_KEY` in
project environment variables, deploy. Optional: `ANTHROPIC_MODEL` (defaults to
`claude-sonnet-5`) and `RATE_LIMIT_PER_HOUR` (defaults to 20 generations per IP
per hour).

The rate limit is in-memory, which means it resets on cold start and isn't
shared across serverless instances. That is enough to stop a public URL running
up a bill by accident; if this ever gets real traffic, move it to Vercel KV or
Upstash. There is no auth — anyone with the URL can generate.

## How it fits together

```
src/lib/layout.ts     the Phase 1 algorithm: column = 1 + max(input columns),
                      rowspan = union of input rowspans, plus group colours,
                      divider placement, and all the validation
src/lib/svg.ts        static renderer — a direct port of render_recipe_diagram.py
src/lib/units.ts      display-unit toggle (source / imperial / metric)
src/lib/share.ts      recipe -> gzipped URL fragment, for /cook links
src/lib/storage.ts    localStorage: cook progress + recent recipes
src/lib/fetchRecipe.ts   URL fetch, schema.org/Recipe JSON-LD first
src/lib/extractPrompt.ts SKILL.md's instructions, restated for one API call

src/components/CookMode.tsx      the interactive checklist
src/components/StaticDiagram.tsx the exportable diagram + SVG/PNG download
src/components/Editor.tsx        fix extraction before rendering
```

Layout metrics live in one place (`C` for the static export, `COMPACT_METRICS`
for phone-sized cook mode). The static SVG always renders with `C`, so exports
stay identical to the skill's regardless of what screen you're on.

## Verifying it

```bash
npm run parity          # static output vs the Phase 1 Python renderer
npm run build && npm start &
npm run verify:cook     # cook-mode collapse behaviour, in a real browser
npm run shots           # screenshots of every fixture in every view
```

`npm run parity` renders all five Phase 1 test recipes through both
`verify/render_recipe_diagram.py` (a verbatim copy of the skill's script, kept
only as a baseline) and this app's TypeScript port, rasterises both, and
compares them pixel by pixel. `npm run verify:cook` drives the real app and
asserts the collapse rules — including the case where two independent branches
share a column and both must be checked before it collapses.

Outputs land in `verify/out/`.

## Known limits

- A component that gets split and reused in two places (half the dough as base,
  half crumbled on top) doesn't fit the merge-tree model. Extraction is told to
  flag it in `notes` rather than force a bad diagram.
- More than three ingredient groups fails colour-vision-deficiency checks, so
  the app turns colour coding off and says why instead of rendering a palette
  that can't be read. Merge groups down to three in the editor to get it back.
- Shareable links carry the whole recipe in the URL fragment. Very long recipes
  make very long links, and some chat apps truncate them.
