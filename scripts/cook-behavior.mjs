/**
 * Cook-mode behaviour check.
 *
 * Drives the real app in a browser and asserts the two rules that make the
 * checklist feel right, both of which are easy to regress:
 *
 *   1. a column with two independent steps in it collapses only once BOTH are
 *      checked (honey-garlic tofu puts the breading and the sauce branches in
 *      the same columns, which is exactly the case that catches this)
 *   2. an ingredient row fades the moment its consuming step is checked, well
 *      before that step's column collapses
 *
 * Plus: single-step columns collapse immediately, the slide actually moves the
 * columns to the right, progress survives a reload, and the divider label stops
 * being clipped when the row narrows.
 *
 *   node scripts/cook-behavior.mjs        (expects `next start` on :3000)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "verify", "out");
mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE_URL || "http://localhost:3000";

const bundlePath = join(outDir, "share.bundle.mjs");
await esbuild.build({
  entryPoints: [join(root, "src", "lib", "share.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
const { encodeRecipe } = await import(bundlePath);

const recipe = JSON.parse(
  readFileSync(join(root, "fixtures", "honey-garlic-tofu.json"), "utf8"),
);
const token = await encodeRecipe(recipe, "source");

const failures = [];
const notes = [];
function check(label, condition, detail = "") {
  if (condition) notes.push(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else failures.push(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
page.on("pageerror", (e) => failures.push(`  FAIL page error — ${e.message}`));

const url = `${BASE}/cook#${token}`;
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("[data-step-id]");

const boardWidth = () =>
  page.$eval(".board", (el) => Math.round(el.getBoundingClientRect().width));
const stepBox = (id) => page.locator(`[data-step-id="${id}"]`);
const collapsed = async (id) =>
  (await stepBox(id).getAttribute("data-collapsed")) === "true";
const left = async (id) =>
  Math.round((await stepBox(id).boundingBox()).x);
const consumed = async (ingId) =>
  page.$eval(`[data-ing-id="${ingId}"]`, (el) =>
    el.className.includes("consumed"),
  );
const settle = () => page.waitForTimeout(700); // let the CSS transition finish

// Column map for this fixture: col1 = {batter, mixsauce}, col2 = {coattofu,
// simmersauce}, col5 = {combine} alone.
const initialWidth = await boardWidth();
const initialCombineLeft = await left("combine");
check("board starts at full width", initialWidth === 300 + 6 * 168, `${initialWidth}px`);

// --- rule 1: a shared column must not collapse on one step alone ----------
await stepBox("batter").click();
await settle();
check(
  "checking one step of a two-step column does not collapse it",
  !(await collapsed("batter")) && (await boardWidth()) === initialWidth,
  `width ${await boardWidth()}px`,
);

// --- rule 2: ingredient rows fade immediately, before any collapse ---------
check(
  "ingredients fade as soon as their step is checked",
  (await consumed("milk")) && (await consumed("pepper")),
);
check(
  "ingredients of an unchecked step stay solid",
  !(await consumed("honey")),
);

await stepBox("mixsauce").click();
await settle();
const afterBoth = await boardWidth();
check(
  "column collapses once every step sharing it is checked",
  (await collapsed("batter")) &&
    (await collapsed("mixsauce")) &&
    afterBoth === initialWidth - (168 - 54),
  `width ${afterBoth}px`,
);
check(
  "columns to the right slide left",
  (await left("combine")) < initialCombineLeft - 100,
  `combine moved ${initialCombineLeft - (await left("combine"))}px`,
);

// --- unchecking restores the column ---------------------------------------
await stepBox("mixsauce").click();
await settle();
check(
  "unchecking one step re-expands the column",
  !(await collapsed("batter")) && (await boardWidth()) === initialWidth,
);
await stepBox("mixsauce").click();
await settle();

// --- single-step column collapses on its own ------------------------------
const beforeSingle = await boardWidth();
await stepBox("combine").click();
await settle();
check(
  "a column holding one step collapses as soon as it is checked",
  (await collapsed("combine")) &&
    (await boardWidth()) === beforeSingle - (168 - 54),
);

// --- divider label survives the squeeze -----------------------------------
for (const id of ["coattofu", "simmersauce", "coatpanko", "bake1"]) {
  await stepBox(id).click();
}
await settle();
const dividerNow = await page.$eval(".divider", (el) => {
  const label = el.querySelector(".divider-label");
  return {
    overflowing: label.getBoundingClientRect().width > el.clientWidth + 1,
    ellipsis: getComputedStyle(label).textOverflow,
  };
});
check(
  "divider label never overflows its banner",
  !dividerNow.overflowing && dividerNow.ellipsis === "ellipsis",
);

await page.screenshot({
  path: join(outDir, "cook-mid.png"),
  fullPage: true,
});

// --- progress persists across a reload ------------------------------------
const doneBefore = await page.$$eval("[data-step-id][aria-pressed='true']", (els) =>
  els.map((e) => e.dataset.stepId).sort(),
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-step-id]");
await settle();
const doneAfter = await page.$$eval("[data-step-id][aria-pressed='true']", (els) =>
  els.map((e) => e.dataset.stepId).sort(),
);
check(
  "checked steps survive a reload",
  JSON.stringify(doneBefore) === JSON.stringify(doneAfter),
  `${doneAfter.length} of ${recipe.steps.length} still checked`,
);

// --- finish the recipe ----------------------------------------------------
for (const s of recipe.steps) {
  const el = stepBox(s.id);
  if ((await el.getAttribute("aria-pressed")) === "false") await el.click();
}
await settle();
check(
  "every column collapses once the whole recipe is done",
  (await boardWidth()) === 300 + 6 * 54,
  `width ${await boardWidth()}px`,
);
await page.screenshot({ path: join(outDir, "cook-done.png"), fullPage: true });

// Reset for the delivered screenshots.
await page.click("text=Reset");
await settle();
await page.screenshot({ path: join(outDir, "cook-start.png"), fullPage: true });

// --- the Phase 1 rough edge: a long divider label on a squeezed row --------
// The tofu fixture's own banner is short enough that it never gets clipped, so
// this uses a deliberately long one to exercise the shrink-then-ellipsis path.
const longLabel =
  "Medium bowl — whisk the honey-garlic sauce together in advance so it is ready the moment the tofu comes out";
const longRecipe = {
  ...recipe,
  dividers: [{ ...recipe.dividers[0], label: longLabel }],
};
await page.goto(`${BASE}/cook#${await encodeRecipe(longRecipe, "source")}`, {
  waitUntil: "networkidle",
});
await page.waitForSelector("[data-step-id]");
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-step-id]");
const longBefore = await page.$eval(".divider", (el) =>
  parseFloat(getComputedStyle(el).fontSize),
);
for (const s of longRecipe.steps) {
  const el = stepBox(s.id);
  if ((await el.getAttribute("aria-pressed")) === "false") await el.click();
}
await settle();
const longAfter = await page.$eval(".divider", (el) => {
  const label = el.querySelector(".divider-label");
  return {
    font: parseFloat(getComputedStyle(el).fontSize),
    overflowing: label.getBoundingClientRect().width > el.clientWidth + 1,
  };
});
check(
  "a long divider label shrinks as its row narrows",
  longAfter.font < longBefore,
  `${longBefore}px -> ${longAfter.font}px`,
);
check(
  "a long divider label still does not overflow when fully collapsed",
  !longAfter.overflowing,
);
await page.evaluate(() => localStorage.clear());

await browser.close();

writeFileSync(join(outDir, "share-url.txt"), url);
console.log([...notes, ...failures].join("\n"));
console.log(
  failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed",
);
process.exit(failures.length ? 1 : 0);
