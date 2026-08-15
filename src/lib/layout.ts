/**
 * Layout core — the Phase 1 algorithm, ported once more (Python skill -> JS
 * prototype -> here) with the same numbers so static output stays at parity:
 *
 *   - each ingredient is a row, in list order
 *   - a step's column  = 1 + max(column of its inputs); ingredients are column 0
 *   - a step's rowspan = union of its inputs' rowspans (min top .. max bottom)
 *
 * Everything else (colors, dividers, validation) is layered on top of that.
 */

import type {
  Divider,
  Ingredient,
  Recipe,
  Step,
  UnitSystem,
  Warning,
} from "./types";
import { convertTempsInText, displayQuantity, displayTemp } from "./units";

export interface Metrics {
  NAME_COL_WIDTH: number;
  STEP_COL_WIDTH: number;
  COLLAPSED_WIDTH: number;
  ROW_HEIGHT: number;
  TALL_ROW_HEIGHT: number;
  HEADER_ROW_HEIGHT: number;
  DIVIDER_HEIGHT: number;
  LEGEND_HEIGHT: number;
  PAD: number;
  WRAP_THRESHOLD: number;
  BORDER_RADIUS: number;
}

/**
 * Phase 1's numbers. The static export must always use these — they're what
 * the parity check compares against.
 */
export const C: Metrics = {
  NAME_COL_WIDTH: 300,
  STEP_COL_WIDTH: 168,
  COLLAPSED_WIDTH: 54,
  ROW_HEIGHT: 56,
  TALL_ROW_HEIGHT: 78,
  HEADER_ROW_HEIGHT: 46,
  DIVIDER_HEIGHT: 44,
  LEGEND_HEIGHT: 34,
  PAD: 14,
  WRAP_THRESHOLD: 34,
  BORDER_RADIUS: 18,
};

/**
 * Cook mode on a phone. A 300px ingredient column swallows a 390px viewport
 * whole, leaving the steps entirely offscreen — which defeats the point of a
 * checklist you cook from. Tightening the columns keeps a step or two in view
 * from the start, and the board only gets narrower as columns collapse.
 */
export const COMPACT_METRICS: Metrics = {
  ...C,
  NAME_COL_WIDTH: 186,
  STEP_COL_WIDTH: 116,
  COLLAPSED_WIDTH: 40,
  ROW_HEIGHT: 52,
  TALL_ROW_HEIGHT: 76,
  HEADER_ROW_HEIGHT: 40,
  DIVIDER_HEIGHT: 38,
  LEGEND_HEIGHT: 30,
  PAD: 10,
  WRAP_THRESHOLD: 20,
};

export const FONT = "Helvetica, Arial, sans-serif";
export const LINE_COLOR = "#2f7d4f";
export const BG_COLOR = "#fffef2";
export const PAGE_COLOR = "#fdf7d8";
export const MERGE_BORDER_COLOR = "#3a3a38";
export const GROUP_TINT_RATIO = 0.22;

/**
 * Fixed, colorblind-checked categorical order. Assigned as groups are first
 * encountered — never hand-picked per recipe. Only the first three slots are
 * validated all-pairs distinct under CVD simulation, which is why MAX_GROUPS
 * is a hard limit rather than a style preference.
 */
export const GROUP_COLOR_ORDER = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#4a3aa7",
];
export const MAX_GROUPS = 3;

export function blendWithWhite(hexColor: string, colorRatio: number): string {
  const hex = hexColor.replace("#", "");
  const mix = (c: number) =>
    Math.round(c * colorRatio + 255 * (1 - colorRatio));
  const r = mix(parseInt(hex.slice(0, 2), 16));
  const g = mix(parseInt(hex.slice(2, 4), 16));
  const b = mix(parseInt(hex.slice(4, 6), 16));
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Greedy word wrap, matching the Python renderer's wrap_text(). */
export function wrapText(text: string, maxChars: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = `${cur} ${w}`.trim();
    if (trial.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export interface StepBox extends Step {
  top: number;
  bottom: number;
  column: number;
  groups: string[];
  /** Ingredient rows that actually feed this step, transitively. */
  rows: number[];
  /** Action lines plus param lines — what the static SVG draws. */
  labelLines: string[];
  /** Param lines only, so the HTML view can style them separately. */
  paramLines: string[];
}

export interface DividerBlock {
  y: number;
  h: number;
  label: string;
  color: string;
  /** Index of the ingredient row this banner sits above. */
  beforeRow: number;
}

export interface Layout {
  ok: boolean;
  metrics: Metrics;
  warnings: Warning[];
  groupColors: Record<string, string>;
  hasGroups: boolean;
  prepLines: string[];
  rowLabels: string[];
  rowHeights: number[];
  rowGroups: (string | null)[];
  rowTop: number[];
  dividerBlocks: DividerBlock[];
  headerHeight: number;
  totalHeight: number;
  totalWidth: number;
  maxColumn: number;
  stepBoxes: StepBox[];
  /** column number -> step ids living in that column */
  columnSteps: Record<number, string[]>;
  /** ingredient id -> id of the step that directly consumes it */
  consumedBy: Record<string, string>;
}

export function ingredientLabel(
  ing: Ingredient,
  units: UnitSystem = "source",
): string {
  const q = displayQuantity(ing, units).trim();
  return `${q} ${(ing.name || "").trim()}`.trim();
}

/**
 * Structural validation that must pass before any layout is attempted.
 * Returns fatal problems only; soft problems (contiguity, group cap) are
 * produced during layout so they can name concrete rows.
 */
function validateStructure(recipe: Recipe): Warning[] {
  const warnings: Warning[] = [];
  const seen = new Set<string>();
  for (const ing of recipe.ingredients || []) {
    if (seen.has(ing.id)) {
      warnings.push({
        level: "error",
        code: "duplicate_id",
        message: `Two ingredients share the id "${ing.id}". Ids must be unique.`,
        refs: [ing.id],
      });
    }
    seen.add(ing.id);
  }

  const defined = new Set(seen);
  for (const step of recipe.steps || []) {
    if (defined.has(step.id)) {
      warnings.push({
        level: "error",
        code: "duplicate_id",
        message: `Step id "${step.id}" collides with another id.`,
        refs: [step.id],
      });
    }
    for (const input of step.inputs || []) {
      if (!defined.has(input)) {
        const laterStep = (recipe.steps || []).some((s) => s.id === input);
        warnings.push({
          level: "error",
          code: laterStep ? "forward_reference" : "unknown_input",
          message: laterStep
            ? `Step "${step.id}" uses "${input}", which happens later. Steps must be listed in the order they happen.`
            : `Step "${step.id}" refers to "${input}", which is not an ingredient or an earlier step.`,
          refs: [step.id, input],
        });
      }
    }
    defined.add(step.id);
  }

  if (!(recipe.steps || []).length) {
    warnings.push({
      level: "error",
      code: "no_steps",
      message: "This recipe has no steps, so there is nothing to merge.",
    });
  }

  const used = new Set<string>();
  for (const step of recipe.steps || []) {
    for (const input of step.inputs || []) used.add(input);
  }
  for (const ing of recipe.ingredients || []) {
    if (!used.has(ing.id)) {
      warnings.push({
        level: "warning",
        code: "orphan_ingredient",
        message: `"${ing.name}" is never used by any step, so nothing will point at it.`,
        refs: [ing.id],
      });
    }
  }

  const ids = new Set((recipe.ingredients || []).map((i) => i.id));
  for (const d of recipe.dividers || []) {
    if (!ids.has(d.before_id)) {
      warnings.push({
        level: "warning",
        code: "divider_mismatch",
        message: `Divider "${d.label}" points at "${d.before_id}", which is not an ingredient — it will not be drawn.`,
        refs: [d.before_id],
      });
    }
  }
  return warnings;
}

export function computeLayout(
  recipe: Recipe,
  units: UnitSystem = "source",
  metrics: Metrics = C,
): Layout {
  const warnings = validateStructure(recipe);
  const fatal = warnings.some((w) => w.level === "error");

  const ingredients: Ingredient[] = recipe.ingredients || [];
  const steps: Step[] = recipe.steps || [];
  const dividers: Divider[] = recipe.dividers || [];
  const prepSteps: string[] = recipe.prep_steps || [];

  // --- group colors, assigned in first-seen order ---------------------------
  let groupColors: Record<string, string> = {};
  for (const ing of ingredients) {
    if (ing.group && !(ing.group in groupColors)) {
      groupColors[ing.group] =
        GROUP_COLOR_ORDER[
          Object.keys(groupColors).length % GROUP_COLOR_ORDER.length
        ];
    }
  }
  if (Object.keys(groupColors).length > MAX_GROUPS) {
    // Hard accessibility constraint: rather than silently rendering a palette
    // that fails colour-vision-deficiency checks, drop grouping entirely and
    // say so. The editor lets the user merge groups down to <= 3.
    warnings.push({
      level: "error",
      code: "too_many_groups",
      message: `This recipe proposes ${Object.keys(groupColors).length} ingredient groups (${Object.keys(
        groupColors,
      ).join(
        ", ",
      )}). Beyond ${MAX_GROUPS} the colours stop being reliably distinguishable, so colour coding has been turned off. Merge groups down to ${MAX_GROUPS} or fewer to get it back.`,
      refs: Object.keys(groupColors),
    });
    groupColors = {};
  }
  const hasGroups = Object.keys(groupColors).length > 0;

  // --- rows ----------------------------------------------------------------
  const rowLabels: string[] = [];
  const rowHeights: number[] = [];
  const rowGroups: (string | null)[] = [];
  for (const ing of ingredients) {
    const label = ingredientLabel(ing, units);
    rowLabels.push(label);
    rowHeights.push(
      label.length > metrics.WRAP_THRESHOLD ? metrics.TALL_ROW_HEIGHT : metrics.ROW_HEIGHT,
    );
    rowGroups.push(hasGroups ? ing.group || null : null);
  }

  const dividersByBeforeId: Record<string, Divider> = {};
  for (const d of dividers) dividersByBeforeId[d.before_id] = d;

  const prepLines = prepSteps.map((p) => convertTempsInText(p, units));

  const headerHeight =
    metrics.HEADER_ROW_HEIGHT * prepSteps.length + (hasGroups ? metrics.LEGEND_HEIGHT : 0);

  const rowTop: number[] = [];
  const dividerBlocks: DividerBlock[] = [];
  let y = headerHeight;
  ingredients.forEach((ing, i) => {
    const d = dividersByBeforeId[ing.id];
    if (d) {
      const color =
        groupColors[(d.group || rowGroups[i]) as string] || LINE_COLOR;
      dividerBlocks.push({
        y,
        h: metrics.DIVIDER_HEIGHT,
        label: d.label,
        color,
        beforeRow: i,
      });
      y += metrics.DIVIDER_HEIGHT;
    }
    rowTop.push(y);
    y += rowHeights[i];
  });
  const totalHeight = y;

  // --- the merge DAG -------------------------------------------------------
  const nodes: Record<string, { top: number; bottom: number; column: number }> =
    {};
  ingredients.forEach((ing, i) => {
    nodes[ing.id] = { top: i, bottom: i, column: 0 };
  });

  const ingredientIds = new Set(ingredients.map((i) => i.id));
  const leafRows: Record<string, Set<number>> = {};
  const leafGroups: Record<string, Set<string>> = {};
  ingredients.forEach((ing, i) => {
    leafRows[ing.id] = new Set([i]);
    leafGroups[ing.id] =
      hasGroups && ing.group ? new Set([ing.group]) : new Set();
  });

  const consumedBy: Record<string, string> = {};
  const columnSteps: Record<number, string[]> = {};
  const stepBoxes: StepBox[] = [];
  let maxColumn = 0;

  for (const step of steps) {
    const inputNodes = (step.inputs || [])
      .map((id) => nodes[id])
      .filter(Boolean);
    if (!inputNodes.length) continue; // structurally invalid; already warned

    const top = Math.min(...inputNodes.map((n) => n.top));
    const bottom = Math.max(...inputNodes.map((n) => n.bottom));
    const column = Math.max(...inputNodes.map((n) => n.column)) + 1;
    maxColumn = Math.max(maxColumn, column);
    nodes[step.id] = { top, bottom, column };

    const rows = new Set<number>();
    const groups = new Set<string>();
    for (const id of step.inputs || []) {
      leafRows[id]?.forEach((r) => rows.add(r));
      leafGroups[id]?.forEach((g) => groups.add(g));
      if (ingredientIds.has(id)) consumedBy[id] = step.id;
    }
    leafRows[step.id] = rows;
    leafGroups[step.id] = groups;

    // Contiguity check: a box is one rectangle from its topmost to its
    // bottommost input row, so any row in between that is NOT an input is
    // being visually claimed by a step it has nothing to do with.
    const extra: number[] = [];
    for (let r = top; r <= bottom; r++) if (!rows.has(r)) extra.push(r);
    if (extra.length) {
      warnings.push({
        level: "warning",
        code: "noncontiguous_inputs",
        message: `Step "${step.action}" will draw a box across ${extra
          .map((r) => `"${rowLabels[r]}"`)
          .join(", ")}, which ${
          extra.length === 1 ? "is not one of" : "are not among"
        } its inputs. Reorder the ingredients so this step's inputs sit together.`,
        refs: [step.id, ...extra.map((r) => ingredients[r]?.id).filter(Boolean)],
      });
    }

    (columnSteps[column] = columnSteps[column] || []).push(step.id);

    const actionMaxChars = Math.max(
      10,
      Math.floor((metrics.STEP_COL_WIDTH - 20) / 8),
    );
    const labelLines = wrapText(step.action, actionMaxChars);
    const params = step.params || {};
    const paramLines: string[] = [];
    for (const k of ["temp", "time", "pan"]) {
      if (params[k]) {
        paramLines.push(k === "temp" ? displayTemp(params[k], units) : params[k]);
      }
    }
    labelLines.push(...paramLines);

    stepBoxes.push({
      ...step,
      top,
      bottom,
      column,
      groups: [...groups].sort(),
      rows: [...rows].sort((a, b) => a - b),
      labelLines,
      paramLines,
    });
  }

  return {
    ok: !fatal,
    metrics,
    warnings,
    groupColors,
    hasGroups,
    prepLines,
    rowLabels,
    rowHeights,
    rowGroups,
    rowTop,
    dividerBlocks,
    headerHeight,
    totalHeight,
    totalWidth: metrics.NAME_COL_WIDTH + maxColumn * metrics.STEP_COL_WIDTH,
    maxColumn,
    stepBoxes,
    columnSteps,
    consumedBy,
  };
}

/** Width of a column given the set of completed step ids (cook mode). */
export function columnWidth(
  layout: Layout,
  col: number,
  done: ReadonlySet<string>,
): number {
  const inCol = layout.columnSteps[col] || [];
  // A column collapses only once EVERY step sharing it is done — two
  // independent branches can land in the same column by coincidence.
  const collapsed = inCol.length > 0 && inCol.every((id) => done.has(id));
  return collapsed
    ? layout.metrics.COLLAPSED_WIDTH
    : layout.metrics.STEP_COL_WIDTH;
}

export function columnX(
  layout: Layout,
  col: number,
  done: ReadonlySet<string>,
): number {
  let x = layout.metrics.NAME_COL_WIDTH;
  for (let c = 1; c < col; c++) x += columnWidth(layout, c, done);
  return x;
}

export function boardWidth(layout: Layout, done: ReadonlySet<string>): number {
  if (layout.maxColumn === 0) return layout.metrics.NAME_COL_WIDTH;
  return (
    columnX(layout, layout.maxColumn, done) +
    columnWidth(layout, layout.maxColumn, done)
  );
}
