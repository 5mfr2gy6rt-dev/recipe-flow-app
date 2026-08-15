#!/usr/bin/env python3
"""
Phase 1 reference renderer, copied verbatim from the project's
recipe-flow-diagram/render_recipe_diagram.py. Kept here ONLY as the baseline
for the parity check — the app itself does not use it.

    python3 render_recipe_diagram.py input.json output.svg
"""
import json
import sys
import html

FONT = "Helvetica, Arial, sans-serif"
NAME_COL_WIDTH = 300
STEP_COL_WIDTH = 168
ROW_HEIGHT = 56
TALL_ROW_HEIGHT = 78
HEADER_ROW_HEIGHT = 46
DIVIDER_HEIGHT = 44
LEGEND_HEIGHT = 34
PAD = 14
LINE_COLOR = "#2f7d4f"
BG_COLOR = "#fffef2"
BORDER_RADIUS = 18
WRAP_THRESHOLD = 34  # chars before we consider a row "tall" / wrap text

GROUP_COLOR_ORDER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#4a3aa7"]
GROUP_TINT_RATIO = 0.22
MERGE_BORDER_COLOR = "#3a3a38"


def wrap_text(text, max_chars):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if len(trial) > max_chars and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def esc(s):
    return html.escape(str(s), quote=True)


def blend_with_white(hex_color, color_ratio):
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r = round(r * color_ratio + 255 * (1 - color_ratio))
    g = round(g * color_ratio + 255 * (1 - color_ratio))
    b = round(b * color_ratio + 255 * (1 - color_ratio))
    return f"#{r:02x}{g:02x}{b:02x}"


def build_svg(data):
    title = data.get("title", "")
    prep_steps = data.get("prep_steps", [])
    ingredients = data["ingredients"]
    steps = data["steps"]
    dividers = data.get("dividers", [])

    group_colors = {}
    for ing in ingredients:
        g = ing.get("group")
        if g and g not in group_colors:
            group_colors[g] = GROUP_COLOR_ORDER[len(group_colors) % len(GROUP_COLOR_ORDER)]
    has_groups = bool(group_colors)

    n = len(ingredients)
    row_heights = []
    row_labels = []
    row_groups = []
    for ing in ingredients:
        label = f'{ing.get("quantity", "").strip()} {ing.get("name", "").strip()}'.strip()
        row_labels.append(label)
        row_heights.append(TALL_ROW_HEIGHT if len(label) > WRAP_THRESHOLD else ROW_HEIGHT)
        row_groups.append(ing.get("group"))

    dividers_by_before_id = {d["before_id"]: d for d in dividers}

    header_height = HEADER_ROW_HEIGHT * len(prep_steps) + (LEGEND_HEIGHT if has_groups else 0)

    row_top = []
    divider_blocks = []
    y = header_height
    for i, ing in enumerate(ingredients):
        d = dividers_by_before_id.get(ing["id"])
        if d:
            color = group_colors.get(d.get("group") or row_groups[i], LINE_COLOR)
            divider_blocks.append((y, DIVIDER_HEIGHT, d["label"], color))
            y += DIVIDER_HEIGHT
        row_top.append(y)
        y += row_heights[i]
    total_ingredient_height = y

    nodes = {}
    for i, ing in enumerate(ingredients):
        nodes[ing["id"]] = {"top": i, "bottom": i, "column": 0}

    leaf_rows = {}
    leaf_groups = {}
    for ing in ingredients:
        leaf_rows[ing["id"]] = {nodes[ing["id"]]["top"]}
        leaf_groups[ing["id"]] = {ing["group"]} if ing.get("group") else set()

    step_boxes = []
    max_column = 0
    for step in steps:
        input_nodes = [nodes[i] for i in step["inputs"]]
        top = min(nd["top"] for nd in input_nodes)
        bottom = max(nd["bottom"] for nd in input_nodes)
        column = max(nd["column"] for nd in input_nodes) + 1
        max_column = max(max_column, column)
        nodes[step["id"]] = {"top": top, "bottom": bottom, "column": column}
        step_boxes.append({**step, "top": top, "bottom": bottom, "column": column})

        actual_rows = set()
        step_groups = set()
        for inp in step["inputs"]:
            actual_rows |= leaf_rows[inp]
            step_groups |= leaf_groups[inp]
        leaf_rows[step["id"]] = actual_rows
        leaf_groups[step["id"]] = step_groups
        step_boxes[-1]["groups"] = step_groups
        expected_rows = set(range(top, bottom + 1))
        extra = expected_rows - actual_rows
        if extra:
            extra_names = [row_labels[i] for i in sorted(extra)]
            print(
                f'WARNING: step "{step["id"]}" ({step["action"]}) will visually cover row(s) '
                f'{sorted(extra)} ({extra_names}) that are NOT actually among its inputs. '
                f'This usually means the ingredient list order needs to change so this step\'s '
                f'inputs form a contiguous block.',
                file=sys.stderr,
            )

    total_width = NAME_COL_WIDTH + max_column * STEP_COL_WIDTH
    total_height = total_ingredient_height

    svg_parts = []
    defs = []
    svg_parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_width + 2*PAD}" '
        f'height="{total_height + 2*PAD}" viewBox="0 0 {total_width + 2*PAD} {total_height + 2*PAD}">'
    )
    svg_parts.append(
        f'<rect x="0" y="0" width="{total_width + 2*PAD}" height="{total_height + 2*PAD}" '
        f'rx="{BORDER_RADIUS+6}" fill="#fdf7d8"/>'
    )
    ox, oy = PAD, PAD
    svg_parts.append(
        f'<rect x="{ox}" y="{oy}" width="{total_width}" height="{total_height}" '
        f'rx="{BORDER_RADIUS}" fill="{BG_COLOR}" stroke="{LINE_COLOR}" stroke-width="3"/>'
    )

    def cell(x, y0, w, h, text_lines, bold=False, size=15, fill="none", fill_opacity=1.0, stroke=None, stroke_width=2):
        stroke = stroke or LINE_COLOR
        parts = [
            f'<rect x="{x}" y="{y0}" width="{w}" height="{h}" fill="{fill}" '
            f'fill-opacity="{fill_opacity}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
        ]
        n_lines = len(text_lines)
        line_h = size + 6
        start_y = y0 + h / 2 - (n_lines - 1) * line_h / 2 + size / 3
        weight = "600" if bold else "400"
        for i, line in enumerate(text_lines):
            parts.append(
                f'<text x="{x + w/2}" y="{start_y + i*line_h}" font-family="{FONT}" '
                f'font-size="{size}" font-weight="{weight}" fill="#1a1a1a" text-anchor="middle">{esc(line)}</text>'
            )
        return "".join(parts)

    for i, ps in enumerate(prep_steps):
        y0 = oy + i * HEADER_ROW_HEIGHT
        svg_parts.append(cell(ox, y0, total_width, HEADER_ROW_HEIGHT, [ps], bold=False, size=16))

    if has_groups:
        y0 = oy + HEADER_ROW_HEIGHT * len(prep_steps)
        svg_parts.append(f'<rect x="{ox}" y="{y0}" width="{total_width}" height="{LEGEND_HEIGHT}" fill="none" stroke="{LINE_COLOR}" stroke-width="2"/>')
        swatch = 14
        gap = 22
        cx = ox + 16
        cy = y0 + LEGEND_HEIGHT / 2
        for gname, color in group_colors.items():
            svg_parts.append(f'<rect x="{cx}" y="{cy - swatch/2}" width="{swatch}" height="{swatch}" rx="3" fill="{color}"/>')
            label = gname[:1].upper() + gname[1:]
            svg_parts.append(
                f'<text x="{cx + swatch + 6}" y="{cy + 5}" font-family="{FONT}" font-size="13" '
                f'fill="#1a1a1a" text-anchor="start">{esc(label)}</text>'
            )
            cx += swatch + 12 + len(label) * 7 + gap

    for i, label in enumerate(row_labels):
        y0 = oy + row_top[i]
        h = row_heights[i]
        lines = wrap_text(label, 40) if h == TALL_ROW_HEIGHT else [label]
        svg_parts.append(cell(ox, y0, NAME_COL_WIDTH, h, lines, size=15))
        g = row_groups[i]
        if g:
            svg_parts.append(f'<rect x="{ox}" y="{y0}" width="5" height="{h}" fill="{group_colors[g]}"/>')

    for y0, h, label, color in divider_blocks:
        svg_parts.append(
            f'<rect x="{ox}" y="{oy + y0}" width="{total_width}" height="{h}" '
            f'fill="{color}" fill-opacity="0.85" stroke="{color}" stroke-width="2"/>'
        )
        svg_parts.append(
            f'<text x="{ox + total_width/2}" y="{oy + y0 + h/2 + 5}" font-family="{FONT}" '
            f'font-size="15" font-weight="600" font-style="italic" fill="#ffffff" text-anchor="middle">{esc(label)}</text>'
        )

    grad_counter = 0
    for step in step_boxes:
        col = step["column"]
        x = ox + NAME_COL_WIDTH + (col - 1) * STEP_COL_WIDTH
        y0 = oy + row_top[step["top"]]
        y1 = oy + row_top[step["bottom"]] + row_heights[step["bottom"]]
        h = y1 - y0
        action_max_chars = max(10, int((STEP_COL_WIDTH - 20) / 8))
        label_lines = wrap_text(step["action"], action_max_chars)
        params = step.get("params") or {}
        if params:
            for k in ("temp", "time", "pan"):
                if params.get(k):
                    label_lines.append(params[k])
        step_font_size = 13 if len(label_lines) > 2 else 16

        groups = sorted(step.get("groups") or [])
        if not groups:
            svg_parts.append(cell(x, y0, STEP_COL_WIDTH, h, label_lines, bold=True, size=step_font_size))
        elif len(groups) == 1:
            color = group_colors[groups[0]]
            tint = blend_with_white(color, GROUP_TINT_RATIO)
            svg_parts.append(cell(x, y0, STEP_COL_WIDTH, h, label_lines, bold=True, size=step_font_size,
                                   fill=tint, fill_opacity=1.0, stroke=color, stroke_width=3))
        else:
            grad_counter += 1
            gid = f"grad{grad_counter}"
            stops = "".join(
                f'<stop offset="{i/(len(groups)-1)*100:.0f}%" stop-color="{blend_with_white(group_colors[g], GROUP_TINT_RATIO)}" stop-opacity="1"/>'
                for i, g in enumerate(groups)
            )
            defs.append(f'<linearGradient id="{gid}" x1="0%" y1="0%" x2="100%" y2="0%">{stops}</linearGradient>')
            svg_parts.append(cell(x, y0, STEP_COL_WIDTH, h, label_lines, bold=True, size=step_font_size,
                                   fill=f"url(#{gid})", fill_opacity=1.0, stroke=MERGE_BORDER_COLOR, stroke_width=3))

    if defs:
        svg_parts.insert(1, "<defs>" + "".join(defs) + "</defs>")

    svg_parts.append("</svg>")
    return "\n".join(svg_parts)


def main():
    if len(sys.argv) != 3:
        print("Usage: render_recipe_diagram.py input.json output.svg", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1]) as f:
        data = json.load(f)
    svg = build_svg(data)
    with open(sys.argv[2], "w") as f:
        f.write(svg)
    print(f"Wrote {sys.argv[2]}")


if __name__ == "__main__":
    main()
