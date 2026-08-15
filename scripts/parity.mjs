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

// A fresh page per shot, not one page reused across every fixture: Skia's
// gradient/compositing state can otherwise leak a channel or two from one
// setContent() call into the next, which reads as a false-positive parity
// failure that has nothing to do with the SVG being rendered.
async function shoot(svgPath, pngPath) {
  const svg = readFileSync(svgPath, "utf8");
  const width = Number(svg.match(/width="(\d+)"/)[1]);
  const height = Number(svg.match(/height="(\d+)"/)[1]);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${svg}</body></html>`,
  );
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return { width, height };
}

// Pixel-exact diff of two same-size PNGs, done in-page via <canvas> so no
// image-diff dependency is needed. Returns null when dimensions don't match
// (there's nothing meaningful to diff pixel-by-pixel in that case). Decoding
// two static PNGs onto blank canvases has none of shoot()'s gradient/paint
// state risk, so one page reused across all fixtures is fine here.
const diffPage = await browser.newPage();
async function pixelDiff(pathA, pathB) {
  const dataA = "data:image/png;base64," + readFileSync(pathA).toString("base64");
  const dataB = "data:image/png;base64," + readFileSync(pathB).toString("base64");
  return diffPage.evaluate(async ({ dataA, dataB }) => {
    function load(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image failed to decode"));
        img.src = src;
      });
    }
    const [imgA, imgB] = await Promise.all([load(dataA), load(dataB)]);
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) return null;

    const draw = (img) => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const dA = draw(imgA);
    const dB = draw(imgB);

    let diffPixels = 0;
    let maxDelta = 0;
    for (let i = 0; i < dA.length; i += 4) {
      const delta =
        Math.abs(dA[i] - dB[i]) +
        Math.abs(dA[i + 1] - dB[i + 1]) +
        Math.abs(dA[i + 2] - dB[i + 2]) +
        Math.abs(dA[i + 3] - dB[i + 3]);
      if (delta > 0) diffPixels++;
      if (delta > maxDelta) maxDelta = delta;
    }
    return { diffPixels, totalPixels: dA.length / 4, maxDelta };
  }, { dataA, dataB });
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

  const pyPng = join(outDir, "png", `${name}.py.png`);
  const appPng = join(outDir, "png", `${name}.app.png`);
  const a = await shoot(pySvg, pyPng);
  const b = await shoot(appSvg, appPng);
  const diff = await pixelDiff(pyPng, appPng);

  results.push({ name, py: a, app: b, diff, pyWarn: pyWarn.trim() });
}

await browser.close();

writeFileSync(
  join(outDir, "dimensions.json"),
  JSON.stringify(results, null, 2),
);

let failed = false;
for (const r of results) {
  const dims = `py ${r.py.width}x${r.py.height} / app ${r.app.width}x${r.app.height}`;
  if (!r.diff) {
    failed = true;
    console.log(`${r.name}: FAIL — dimension mismatch (${dims})`);
  } else if (r.diff.diffPixels > 0) {
    failed = true;
    console.log(
      `${r.name}: FAIL — ${r.diff.diffPixels}/${r.diff.totalPixels} px differ ` +
        `(max channel delta ${r.diff.maxDelta}) — ${dims}`,
    );
  } else {
    console.log(`${r.name}: OK — pixel-identical (${dims})`);
  }
}

if (failed) {
  console.error(
    "\nParity FAILED. This is either a bug or an intentional divergence that " +
      "needs recording in docs/phase2-notes.md — never silently accepted.",
  );
  process.exit(1);
}
