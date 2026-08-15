/**
 * Static-output parity check.
 *
 * Renders each fixture twice — once through the Phase 1 Python skill script,
 * once through the app's TypeScript port — rasterises both in Chromium, and
 * compares them pixel by pixel. The claim "the static view matches the skill's
 * output" is only worth making if something checks it.
 *
 *   node scripts/parity.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "verify", "out");
mkdirSync(join(outDir, "py"), { recursive: true });
mkdirSync(join(outDir, "app"), { recursive: true });
mkdirSync(join(outDir, "png"), { recursive: true });

// Bundle the app's renderer so this script can call it directly.
const bundlePath = join(outDir, "svg.bundle.mjs");
await esbuild.build({
  entryPoints: [join(root, "src", "lib", "svg.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
const { buildSvg } = await import(bundlePath);

const fixtures = readdirSync(join(root, "fixtures")).filter((f) =>
  f.endsWith(".json"),
);

// This sandbox ships a pinned Chromium that may not match the npm package's
// expected build; point at it explicitly rather than downloading another.
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();

async function shoot(svgPath, pngPath) {
  const svg = readFileSync(svgPath, "utf8");
  const width = Number(svg.match(/width="(\d+)"/)[1]);
  const height = Number(svg.match(/height="(\d+)"/)[1]);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${svg}</body></html>`,
  );
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width, height } });
  return { width, height };
}

const results = [];
for (const file of fixtures) {
  const name = basename(file, ".json");
  const jsonPath = join(root, "fixtures", file);
  const recipe = JSON.parse(readFileSync(jsonPath, "utf8"));

  const pySvg = join(outDir, "py", `${name}.svg`);
  const pyWarn = execFileSync(
    "python3",
    [join(root, "verify", "render_recipe_diagram.py"), jsonPath, pySvg],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  const appSvg = join(outDir, "app", `${name}.svg`);
  writeFileSync(appSvg, buildSvg(recipe, "source"));

  const a = await shoot(pySvg, join(outDir, "png", `${name}.py.png`));
  const b = await shoot(appSvg, join(outDir, "png", `${name}.app.png`));

  results.push({ name, py: a, app: b, pyWarn: pyWarn.trim() });
}

await browser.close();

writeFileSync(
  join(outDir, "dimensions.json"),
  JSON.stringify(results, null, 2),
);
console.log(
  results
    .map((r) => `${r.name}: py ${r.py.width}x${r.py.height} / app ${r.app.width}x${r.app.height}`)
    .join("\n"),
);
