/**
 * Loads each fixture into the home page (via the recents store, so no API key
 * is needed) and screenshots the diagram, cook and edit views. Used to eyeball
 * the app end to end without spending an extraction call.
 *
 *   node scripts/ui-shots.mjs
 */

import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "verify", "out", "ui");
mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE_URL || "http://localhost:3000";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

for (const file of readdirSync(join(root, "fixtures")).filter((f) =>
  f.endsWith(".json"),
)) {
  const name = basename(file, ".json");
  const recipe = JSON.parse(
    readFileSync(join(root, "fixtures", file), "utf8"),
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((r) => {
    localStorage.setItem(
      "rfd:recents",
      JSON.stringify([
        { key: "seed", title: r.title, savedAt: Date.now(), units: "source", recipe: r },
      ]),
    );
  }, recipe);
  await page.reload({ waitUntil: "networkidle" });
  await page.click(".recents .link");
  await page.waitForSelector(".static-diagram svg");
  await page.screenshot({ path: join(outDir, `${name}-diagram.png`), fullPage: true });

  if (name === "honey-garlic-tofu") {
    await page.click("text=Metric");
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, `${name}-metric.png`), fullPage: true });
    await page.click("text=As written");
    await page.click("[role='tab']:has-text('Edit')");
    await page.waitForSelector(".editor");
    await page.screenshot({ path: join(outDir, `${name}-edit.png`), fullPage: true });
  }
}

// Mobile viewport sanity check for cook mode.
const phone = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await phone.goto(BASE, { waitUntil: "networkidle" });
await phone.evaluate((r) => {
  localStorage.setItem(
    "rfd:recents",
    JSON.stringify([
      { key: "seed", title: r.title, savedAt: Date.now(), units: "source", recipe: r },
    ]),
  );
}, JSON.parse(readFileSync(join(root, "fixtures", "brownies.json"), "utf8")));
await phone.reload({ waitUntil: "networkidle" });
await phone.click(".recents .link");
await phone.click("[role='tab']:has-text('Cook mode')");
await phone.waitForSelector("[data-step-id]");
await phone.screenshot({ path: join(outDir, "mobile-cook.png"), fullPage: true });

await browser.close();
console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
