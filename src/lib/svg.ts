/**
 * Static diagram renderer — a direct port of Phase 1's render_recipe_diagram.py,
 * kept deliberately close to the original (same constants, same draw order,
 * same text placement maths) so the app's static export stays at pixel parity
 * with the skill's SVG. scripts/parity.mjs checks that claim.
 */

import {
  BG_COLOR,
  C,
  FONT,
  GROUP_TINT_RATIO,
  LINE_COLOR,
  MERGE_BORDER_COLOR,
  PAGE_COLOR,
  blendWithWhite,
  computeLayout,
  wrapText,
  type Layout,
} from "./layout";
import type { Recipe, UnitSystem } from "./types";

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Match Python's float formatting: 150.0 rather than 150. */
function n(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

interface CellOpts {
  bold?: boolean;
  size?: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
}

function cell(
  x: number,
  y0: number,
  w: number,
  h: number,
  textLines: string[],
  opts: CellOpts = {},
): string {
  const {
    bold = false,
    size = 15,
    fill = "none",
    fillOpacity = 1.0,
    stroke = LINE_COLOR,
    strokeWidth = 2,
  } = opts;
  const parts = [
    `<rect x="${x}" y="${y0}" width="${w}" height="${h}" fill="${fill}" ` +
      `fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
  ];
  const nLines = textLines.length;
  const lineH = size + 6;
  const startY = y0 + h / 2 - ((nLines - 1) * lineH) / 2 + size / 3;
  const weight = bold ? "600" : "400";
  textLines.forEach((line, i) => {
    parts.push(
      `<text x="${n(x + w / 2)}" y="${n(startY + i * lineH)}" font-family="${FONT}" ` +
        `font-size="${size}" font-weight="${weight}" fill="#1a1a1a" text-anchor="middle">${esc(
          line,
        )}</text>`,
    );
  });
  return parts.join("");
}

export function buildSvg(
  recipe: Recipe,
  units: UnitSystem = "source",
  layoutIn?: Layout,
): string {
  // Always render with Phase 1's metrics, even if the caller hands us a layout
  // built for a compact screen — the export must stay at parity with the skill.
  const layout =
    layoutIn && layoutIn.metrics === C ? layoutIn : computeLayout(recipe, units, C);
  const {
    groupColors,
    hasGroups,
    rowLabels,
    rowHeights,
    rowGroups,
    rowTop,
    dividerBlocks,
    prepLines,
    stepBoxes,
    totalHeight,
    totalWidth,
  } = layout;
  const prepSteps = prepLines;

  const svg: string[] = [];
  const defs: string[] = [];
  const W = totalWidth + 2 * C.PAD;
  const H = totalHeight + 2 * C.PAD;

  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  svg.push(
    `<rect x="0" y="0" width="${W}" height="${H}" rx="${C.BORDER_RADIUS + 6}" fill="${PAGE_COLOR}"/>`,
  );
  const ox = C.PAD;
  const oy = C.PAD;
  svg.push(
    `<rect x="${ox}" y="${oy}" width="${totalWidth}" height="${totalHeight}" ` +
      `rx="${C.BORDER_RADIUS}" fill="${BG_COLOR}" stroke="${LINE_COLOR}" stroke-width="3"/>`,
  );

  // prep step header rows (full width)
  prepSteps.forEach((ps, i) => {
    svg.push(
      cell(ox, oy + i * C.HEADER_ROW_HEIGHT, totalWidth, C.HEADER_ROW_HEIGHT, [ps], {
        size: 16,
      }),
    );
  });

  // legend, only when some ingredient carries a group
  if (hasGroups) {
    const y0 = oy + C.HEADER_ROW_HEIGHT * prepSteps.length;
    svg.push(
      `<rect x="${ox}" y="${y0}" width="${totalWidth}" height="${C.LEGEND_HEIGHT}" fill="none" stroke="${LINE_COLOR}" stroke-width="2"/>`,
    );
    const swatch = 14;
    const gap = 22;
    let cx = ox + 16;
    const cy = y0 + C.LEGEND_HEIGHT / 2;
    for (const [gname, color] of Object.entries(groupColors)) {
      svg.push(
        `<rect x="${cx}" y="${n(cy - swatch / 2)}" width="${swatch}" height="${swatch}" rx="3" fill="${color}"/>`,
      );
      const label = gname.charAt(0).toUpperCase() + gname.slice(1);
      svg.push(
        `<text x="${cx + swatch + 6}" y="${n(cy + 5)}" font-family="${FONT}" font-size="13" ` +
          `fill="#1a1a1a" text-anchor="start">${esc(label)}</text>`,
      );
      cx += swatch + 12 + label.length * 7 + gap;
    }
  }

  // ingredient name column, with a colour accent bar when grouped
  rowLabels.forEach((label, i) => {
    const y0 = oy + rowTop[i];
    const h = rowHeights[i];
    const lines = h === C.TALL_ROW_HEIGHT ? wrapText(label, 40) : [label];
    svg.push(cell(ox, y0, C.NAME_COL_WIDTH, h, lines, { size: 15 }));
    const g = rowGroups[i];
    if (g) {
      svg.push(
        `<rect x="${ox}" y="${y0}" width="5" height="${h}" fill="${groupColors[g]}"/>`,
      );
    }
  });

  // Divider banners are drawn BEFORE step boxes: a merge box whose row-span
  // crosses a divider paints over it with its own opaque fill, so the banner
  // only shows through in columns that don't have a box there yet.
  for (const d of dividerBlocks) {
    svg.push(
      `<rect x="${ox}" y="${oy + d.y}" width="${totalWidth}" height="${d.h}" ` +
        `fill="${d.color}" fill-opacity="0.85" stroke="${d.color}" stroke-width="2"/>`,
    );
    svg.push(
      `<text x="${n(ox + totalWidth / 2)}" y="${n(oy + d.y + d.h / 2 + 5)}" font-family="${FONT}" ` +
        `font-size="15" font-weight="600" font-style="italic" fill="#ffffff" text-anchor="middle">${esc(
          d.label,
        )}</text>`,
    );
  }

  // step boxes
  let gradCounter = 0;
  for (const step of stepBoxes) {
    const x = ox + C.NAME_COL_WIDTH + (step.column - 1) * C.STEP_COL_WIDTH;
    const y0 = oy + rowTop[step.top];
    const y1 = oy + rowTop[step.bottom] + rowHeights[step.bottom];
    const h = y1 - y0;
    const lines = step.labelLines;
    const size = lines.length > 2 ? 13 : 16;
    const groups = step.groups;

    if (!groups.length) {
      svg.push(cell(x, y0, C.STEP_COL_WIDTH, h, lines, { bold: true, size }));
    } else if (groups.length === 1) {
      const color = groupColors[groups[0]];
      svg.push(
        cell(x, y0, C.STEP_COL_WIDTH, h, lines, {
          bold: true,
          size,
          fill: blendWithWhite(color, GROUP_TINT_RATIO),
          fillOpacity: 1.0,
          stroke: color,
          strokeWidth: 3,
        }),
      );
    } else {
      gradCounter += 1;
      const gid = `grad${gradCounter}`;
      const stops = groups
        .map(
          (g, i) =>
            `<stop offset="${((i / (groups.length - 1)) * 100).toFixed(0)}%" ` +
            `stop-color="${blendWithWhite(groupColors[g], GROUP_TINT_RATIO)}" stop-opacity="1"/>`,
        )
        .join("");
      defs.push(
        `<linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient>`,
      );
      // Fully opaque so the box cleanly masks a divider banner it spans across.
      svg.push(
        cell(x, y0, C.STEP_COL_WIDTH, h, lines, {
          bold: true,
          size,
          fill: `url(#${gid})`,
          fillOpacity: 1.0,
          stroke: MERGE_BORDER_COLOR,
          strokeWidth: 3,
        }),
      );
    }
  }

  if (defs.length) svg.splice(1, 0, `<defs>${defs.join("")}</defs>`);
  svg.push("</svg>");
  return svg.join("\n");
}
