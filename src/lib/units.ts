/**
 * Display-unit toggle.
 *
 * Phase 1's rule was "preserve quantities exactly as written" — that stays the
 * default (`source`). The toggle is display-only: it never rewrites the stored
 * recipe, and when a quantity can't be converted confidently it falls back to
 * the source string rather than guessing. Extraction may also supply
 * `quantity_imperial` / `quantity_metric` directly, which always win.
 */

import type { Ingredient, UnitSystem } from "./types";

const VULGAR: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/** "1 1/2", "1½", "0.75", "3/4" -> number. Returns null if not numeric. */
function parseAmount(raw: string): number | null {
  let s = raw.trim();
  let total = 0;
  let matched = false;
  for (const [glyph, value] of Object.entries(VULGAR)) {
    if (s.includes(glyph)) {
      total += value;
      s = s.replace(glyph, " ");
      matched = true;
    }
  }
  const mixed = s.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    total += Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return total;
  }
  const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) {
    total += Number(frac[1]) / Number(frac[2]);
    return total;
  }
  const dec = s.match(/\d+(?:\.\d+)?/);
  if (dec) {
    total += Number(dec[0]);
    return total;
  }
  return matched ? total : null;
}

type UnitDef = {
  system: "imperial" | "metric";
  kind: "volume" | "mass";
  /** canonical base: ml for volume, g for mass */
  base: number;
};

const UNITS: Record<string, UnitDef> = {
  cup: { system: "imperial", kind: "volume", base: 236.588 },
  cups: { system: "imperial", kind: "volume", base: 236.588 },
  tbsp: { system: "imperial", kind: "volume", base: 14.787 },
  tbs: { system: "imperial", kind: "volume", base: 14.787 },
  tablespoon: { system: "imperial", kind: "volume", base: 14.787 },
  tablespoons: { system: "imperial", kind: "volume", base: 14.787 },
  tsp: { system: "imperial", kind: "volume", base: 4.929 },
  teaspoon: { system: "imperial", kind: "volume", base: 4.929 },
  teaspoons: { system: "imperial", kind: "volume", base: 4.929 },
  "fl oz": { system: "imperial", kind: "volume", base: 29.574 },
  pint: { system: "imperial", kind: "volume", base: 473.176 },
  pints: { system: "imperial", kind: "volume", base: 473.176 },
  quart: { system: "imperial", kind: "volume", base: 946.353 },
  quarts: { system: "imperial", kind: "volume", base: 946.353 },
  oz: { system: "imperial", kind: "mass", base: 28.35 },
  ounce: { system: "imperial", kind: "mass", base: 28.35 },
  ounces: { system: "imperial", kind: "mass", base: 28.35 },
  lb: { system: "imperial", kind: "mass", base: 453.592 },
  lbs: { system: "imperial", kind: "mass", base: 453.592 },
  pound: { system: "imperial", kind: "mass", base: 453.592 },
  pounds: { system: "imperial", kind: "mass", base: 453.592 },
  ml: { system: "metric", kind: "volume", base: 1 },
  milliliter: { system: "metric", kind: "volume", base: 1 },
  milliliters: { system: "metric", kind: "volume", base: 1 },
  l: { system: "metric", kind: "volume", base: 1000 },
  liter: { system: "metric", kind: "volume", base: 1000 },
  liters: { system: "metric", kind: "volume", base: 1000 },
  litre: { system: "metric", kind: "volume", base: 1000 },
  g: { system: "metric", kind: "mass", base: 1 },
  gram: { system: "metric", kind: "mass", base: 1 },
  grams: { system: "metric", kind: "mass", base: 1 },
  kg: { system: "metric", kind: "mass", base: 1000 },
  kilogram: { system: "metric", kind: "mass", base: 1000 },
  kilograms: { system: "metric", kind: "mass", base: 1000 },
};

const UNIT_WORDS = Object.keys(UNITS).sort((a, b) => b.length - a.length);

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Render a fractional cup/tbsp/tsp amount the way a recipe would write it. */
function niceFraction(n: number): string {
  const denominators = [2, 3, 4, 8];
  const whole = Math.floor(n);
  const rest = n - whole;
  if (rest < 0.02) return String(whole || 0);
  for (const d of denominators) {
    const num = Math.round(rest * d);
    if (num > 0 && Math.abs(rest - num / d) < 0.02) {
      const frac = `${num}/${d}`;
      return whole ? `${whole} ${frac}` : frac;
    }
  }
  return String(round(n, 2));
}

function toMetric(amount: number, def: UnitDef): string | null {
  if (def.system === "metric") return null;
  const base = amount * def.base;
  if (def.kind === "mass") {
    return base >= 1000 ? `${round(base / 1000, 2)} kg` : `${round(base)} g`;
  }
  return base >= 1000 ? `${round(base / 1000, 2)} L` : `${round(base)} ml`;
}

function toImperial(amount: number, def: UnitDef): string | null {
  if (def.system === "imperial") return null;
  const base = amount * def.base;
  if (def.kind === "mass") {
    const lb = base / 453.592;
    if (lb >= 1) return `${niceFraction(lb)} lb`;
    return `${round(base / 28.35, 1)} oz`;
  }
  if (base >= 118) return `${niceFraction(base / 236.588)} cup`;
  if (base >= 14) return `${niceFraction(base / 14.787)} Tbsp`;
  return `${niceFraction(base / 4.929)} tsp`;
}

/**
 * Convert a written quantity into the requested system. Returns null when the
 * string has no recognisable unit ("1 (16 oz) package" is deliberately left
 * alone, as is "to garnish" or "2-3 large").
 */
export function convertQuantity(
  quantity: string,
  target: "imperial" | "metric",
): string | null {
  if (!quantity) return null;
  const q = quantity.trim();
  // Ranges and parenthetical package sizes are left verbatim — converting them
  // reliably is not worth the risk of producing a wrong number.
  if (/\d\s*[-–]\s*\d/.test(q) || /\(/.test(q)) return null;

  const lower = q.toLowerCase();
  let unitWord: string | null = null;
  let unitIndex = -1;
  for (const w of UNIT_WORDS) {
    const re = new RegExp(`(^|[^a-z])${w.replace(" ", "\\s+")}(s?)\\b`, "i");
    const m = lower.match(re);
    if (m && m.index !== undefined) {
      unitWord = w;
      unitIndex = m.index;
      break;
    }
  }
  if (!unitWord) return null;

  const def = UNITS[unitWord];
  if (def.system === target) return null;

  const amountStr = q.slice(0, unitIndex + 1);
  const amount = parseAmount(amountStr);
  if (amount === null || amount <= 0) return null;

  const converted =
    target === "metric" ? toMetric(amount, def) : toImperial(amount, def);
  if (!converted) return null;

  // Preserve any trailing descriptor: "1 cup, packed" -> "236 ml, packed"
  const tail = q
    .slice(unitIndex + 1)
    .replace(new RegExp(`^\\s*${unitWord}s?\\b`, "i"), "")
    .trim();
  return tail ? `${converted} ${tail}` : converted;
}

export function displayQuantity(
  ing: Ingredient,
  units: UnitSystem = "source",
): string {
  const source = ing.quantity || "";
  if (units === "source") return source;
  const explicit =
    units === "metric" ? ing.quantity_metric : ing.quantity_imperial;
  if (explicit) return explicit;
  return convertQuantity(source, units) ?? source;
}

/**
 * Replace every temperature mentioned in a free-text line ("Preheat oven to
 * 450°F"), so a prep header can't contradict the step box below it.
 */
export function convertTempsInText(text: string, units: UnitSystem): string {
  if (units === "source" || !text) return text;
  return text.replace(/(-?\d+(?:\.\d+)?)\s*°?\s*([FC])\b/gi, (m) =>
    displayTemp(m, units),
  );
}

/** Oven temperatures in step params get the same treatment. */
export function displayTemp(temp: string, units: UnitSystem): string {
  if (units === "source" || !temp) return temp;
  const f = temp.match(/(-?\d+(?:\.\d+)?)\s*°?\s*F\b/i);
  const c = temp.match(/(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i);
  if (units === "metric" && f) {
    return `${Math.round(((Number(f[1]) - 32) * 5) / 9 / 5) * 5}°C`;
  }
  if (units === "imperial" && c) {
    return `${Math.round(((Number(c[1]) * 9) / 5 + 32) / 5) * 5}°F`;
  }
  return temp;
}
