/**
 * Shareable cook-mode links. The whole recipe is compressed into the URL
 * fragment, so sharing needs no database and the recipe never touches the
 * server on open. Fragments aren't sent in the HTTP request at all, which is
 * also why this is a reasonable place to put user content.
 */

import type { Recipe, UnitSystem } from "./types";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(input: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(input)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(input: Uint8Array): Promise<string> {
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function encodeRecipe(
  recipe: Recipe,
  units: UnitSystem = "source",
): Promise<string> {
  const payload = JSON.stringify({ v: 1, u: units, r: recipe });
  if (typeof CompressionStream === "undefined") {
    return `r0.${toBase64Url(new TextEncoder().encode(payload))}`;
  }
  return `r1.${toBase64Url(await gzip(payload))}`;
}

export async function decodeRecipe(
  hash: string,
): Promise<{ recipe: Recipe; units: UnitSystem } | null> {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  try {
    const [version, data] = raw.split(".");
    let json: string;
    if (version === "r1") {
      json = await gunzip(fromBase64Url(data));
    } else if (version === "r0") {
      json = new TextDecoder().decode(fromBase64Url(data));
    } else {
      return null;
    }
    const parsed = JSON.parse(json);
    if (!parsed?.r?.ingredients || !parsed?.r?.steps) return null;
    return { recipe: parsed.r as Recipe, units: (parsed.u as UnitSystem) || "source" };
  } catch {
    return null;
  }
}

export async function buildShareUrl(
  recipe: Recipe,
  units: UnitSystem,
): Promise<string> {
  const token = await encodeRecipe(recipe, units);
  return `${window.location.origin}/cook#${token}`;
}
