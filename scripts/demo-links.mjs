/**
 * Prints a link per fixture that opens the app on that recipe with no API key
 * and no extraction call — the recipe travels in the URL fragment. Useful for
 * trying the app out, and for demoing it without spending anything.
 *
 *   npm run demo
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

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

const lines = [];
for (const file of readdirSync(join(root, "fixtures"))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const recipe = JSON.parse(readFileSync(join(root, "fixtures", file), "utf8"));
  const token = await encodeRecipe(recipe, "source");
  lines.push(`${recipe.title}\n  ${BASE}/#${token}\n`);
}

const text = lines.join("\n");
writeFileSync(join(outDir, "demo-links.txt"), text);
console.log(
  `\nOpen any of these with the server running (npm run dev). No API key needed —\nthe recipe is carried in the link itself.\n\n${text}` +
    `Also saved to verify/out/demo-links.txt\n`,
);
