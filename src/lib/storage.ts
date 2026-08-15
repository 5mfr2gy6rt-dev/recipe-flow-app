/**
 * Browser persistence. This is a real web app rather than a Claude artifact,
 * so localStorage is fair game: cook-mode progress survives leaving mid-cook,
 * and recently generated recipes can be reopened without paying for another
 * extraction.
 */

import type { Recipe, UnitSystem } from "./types";

const PROGRESS_PREFIX = "rfd:progress:";
const RECENTS_KEY = "rfd:recents";
const MAX_RECENTS = 12;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Stable id for a recipe, so progress follows the recipe rather than the tab.
 * Derived from the title plus the step shape, which means editing the merge
 * structure correctly starts a fresh checklist.
 */
export function recipeKey(recipe: Recipe): string {
  const shape = (recipe.steps || [])
    .map((s) => `${s.id}:${(s.inputs || []).join("+")}`)
    .join("|");
  const raw = `${recipe.title}|${shape}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function loadProgress(recipe: Recipe): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(
    window.localStorage.getItem(PROGRESS_PREFIX + recipeKey(recipe)),
    [],
  );
}

export function saveProgress(recipe: Recipe, done: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  const key = PROGRESS_PREFIX + recipeKey(recipe);
  try {
    if (done.size === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify([...done]));
  } catch {
    /* quota or private mode — progress just won't persist */
  }
}

export interface RecentEntry {
  key: string;
  title: string;
  savedAt: number;
  units: UnitSystem;
  recipe: Recipe;
}

export function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<RecentEntry[]>(
    window.localStorage.getItem(RECENTS_KEY),
    [],
  ).filter((e) => e?.recipe?.ingredients);
}

export function saveRecent(recipe: Recipe, units: UnitSystem): void {
  if (typeof window === "undefined") return;
  const key = recipeKey(recipe);
  const entry: RecentEntry = {
    key,
    title: recipe.title || "Untitled recipe",
    savedAt: Date.now(),
    units,
    recipe,
  };
  const next = [entry, ...loadRecents().filter((e) => e.key !== key)].slice(
    0,
    MAX_RECENTS,
  );
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function removeRecent(key: string): RecentEntry[] {
  const next = loadRecents().filter((e) => e.key !== key);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
