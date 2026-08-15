/**
 * Server-side recipe fetching. Prefer schema.org/Recipe JSON-LD — most recipe
 * sites embed it and it is far cleaner than scraping the rendered page — and
 * fall back to visible text when it is missing or unusable.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export interface FetchedRecipe {
  /** Cleaned text handed to the model. */
  text: string;
  /** Whether it came from structured data or scraped body text. */
  via: "json-ld" | "scraped";
  title?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function collectJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^﻿/, "");
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Some sites emit slightly malformed JSON-LD; a trailing-comma retry
      // rescues a decent share of them, and anything else falls through to
      // the scraped-text path.
      try {
        out.push(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")));
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const t = (node as Record<string, unknown>)["@type"];
  if (typeof t === "string") return t.toLowerCase() === "recipe";
  if (Array.isArray(t))
    return t.some((x) => String(x).toLowerCase() === "recipe");
  return false;
}

function findRecipeNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !value || typeof value !== "object") return null;
  if (isRecipeNode(value)) return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findRecipeNode(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findRecipeNode(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function instructionsToLines(value: unknown, out: string[] = []): string[] {
  if (!value) return out;
  if (typeof value === "string") {
    const t = stripTags(value);
    if (t) out.push(t);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) instructionsToLines(v, out);
    return out;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const type = String(o["@type"] ?? "").toLowerCase();
    if (type === "howtosection") {
      if (o.name) out.push(`— ${stripTags(String(o.name))} —`);
      instructionsToLines(o.itemListElement, out);
      return out;
    }
    if (o.text) return instructionsToLines(o.text, out);
    if (o.name) return instructionsToLines(o.name, out);
    if (o.itemListElement) return instructionsToLines(o.itemListElement, out);
  }
  return out;
}

export async function fetchRecipeFromUrl(url: string): Promise<FetchedRecipe> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) URLs can be fetched.");
  }
  // Block obvious SSRF targets. Not a substitute for network egress rules in a
  // real deployment, but it stops the easy cases.
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^(127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("That host isn't reachable from the server.");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      `The site returned ${res.status}. Some recipe sites block automated requests — try pasting the text instead.`,
    );
  }
  const html = await res.text();

  for (const block of collectJsonLd(html)) {
    const node = findRecipeNode(block);
    if (!node) continue;
    const name = node.name ? stripTags(String(node.name)) : undefined;
    const ingredients = ([] as string[]).concat(
      (node.recipeIngredient as string[]) ||
        (node.ingredients as string[]) ||
        [],
    );
    const instructions = instructionsToLines(node.recipeInstructions);
    if (ingredients.length && instructions.length) {
      const yieldText = node.recipeYield ? `Yield: ${node.recipeYield}` : "";
      return {
        via: "json-ld",
        title: name,
        text: [
          name ? `Title: ${name}` : "",
          yieldText,
          "",
          "Ingredients:",
          ...ingredients.map((i) => `- ${stripTags(String(i))}`),
          "",
          "Instructions:",
          ...instructions.map((s, i) => `${i + 1}. ${s}`),
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = stripTags(html);
  if (text.length < 200) {
    throw new Error(
      "Couldn't read anything useful from that page — it may render entirely in JavaScript. Try pasting the recipe text or a screenshot.",
    );
  }
  return {
    via: "scraped",
    title: titleMatch ? decodeEntities(titleMatch[1]).trim() : undefined,
    text: text.slice(0, 24_000),
  };
}
