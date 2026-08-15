"use client";

/**
 * Cook mode — the approved Phase 2 prototype, ported to React.
 *
 * The mechanics are deliberately unchanged from phase2-checklist-prototype.html:
 * absolutely-positioned elements, a column-offset function recomputed on every
 * toggle, and CSS transitions on `left`/`width` for the slide. Animating grid
 * track sizes would be tidier in principle and worse in practice.
 *
 * Two behaviours that matter and are easy to break:
 *   - a column collapses only once EVERY step sharing it is done (two
 *     independent branches can land in the same column by coincidence)
 *   - an ingredient row fades and strikes through the moment the step that
 *     directly consumes it is checked, without waiting for the collapse
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  BG_COLOR,
  C,
  COMPACT_METRICS,
  GROUP_TINT_RATIO,
  LINE_COLOR,
  MERGE_BORDER_COLOR,
  blendWithWhite,
  boardWidth as computeBoardWidth,
  columnWidth,
  columnX,
  computeLayout,
} from "@/lib/layout";
import { loadProgress, saveProgress } from "@/lib/storage";
import type { Recipe, UnitSystem } from "@/lib/types";

interface Props {
  recipe: Recipe;
  units: UnitSystem;
  /** Persist checkmarks to localStorage. Off for previews. */
  persist?: boolean;
}

/**
 * Divider banners get squeezed as columns collapse around them, which used to
 * clip the label outright. Shrink the type down to a floor, then let ellipsis
 * plus a tooltip carry the rest.
 */
function dividerFontSize(
  available: number,
  label: string,
  ideal = 15,
): number {
  const approxCharWidth = 0.54;
  const fits = (available - 28) / (label.length * approxCharWidth);
  return Math.max(9, Math.min(ideal, Math.floor(fits)));
}

export default function CookMode({ recipe, units, persist = true }: Props) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [compact, setCompact] = useState(false);
  const [fit, setFit] = useState(false);
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phone-sized viewports get the tighter board so the first step column is
  // on screen without scrolling sideways first.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const metrics = compact ? COMPACT_METRICS : C;
  const layout = useMemo(
    () => computeLayout(recipe, units, metrics),
    [recipe, units, metrics],
  );

  useEffect(() => {
    if (persist) setDone(new Set(loadProgress(recipe)));
    else setDone(new Set());
    setHydrated(true);
  }, [recipe, persist]);

  useEffect(() => {
    if (hydrated && persist) saveProgress(recipe, done);
  }, [done, recipe, persist, hydrated]);

  const toggle = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const width = computeBoardWidth(layout, done);
  const height = layout.totalHeight;
  const total = layout.stepBoxes.length;

  // "Fit" scales the whole board down to the available width. It is a transform
  // rather than a re-layout, so the column maths — and the collapse animation —
  // are untouched.
  useLayoutEffect(() => {
    if (!fit) {
      setScale(1);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setScale(
        Math.min(1, el.clientWidth / (width + 2 * layout.metrics.PAD)),
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, width, layout.metrics.PAD]);

  const allDone = total > 0 && done.size === total;

  return (
    <div className={`cook${compact ? " compact" : ""}`}>
      <div className="cook-toolbar">
        <div className="progress-wrap" aria-hidden="true">
          <div
            className="progress-bar"
            style={{ width: total ? `${(done.size / total) * 100}%` : "0%" }}
          />
        </div>
        <span className="progress-text">
          {done.size} of {total} steps done{allDone ? " — enjoy!" : ""}
        </span>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setFit((f) => !f)}
          aria-pressed={fit}
        >
          {fit ? "Actual size" : "Fit to width"}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setDone(new Set())}
          disabled={done.size === 0}
        >
          Reset
        </button>
      </div>

      <div className="board-scroll" ref={scrollRef}>
        <div
          className="scaler"
          style={{
            transform: `scale(${scale})`,
            height: scale < 1 ? (height + 2 * layout.metrics.PAD) * scale : undefined,
          }}
        >
        <div className="card" style={{ width: width + 2 * layout.metrics.PAD }}>
          <div className="board" style={{ width, height }}>
            {/* prep step header rows */}
            {layout.prepLines.map((ps, i) => (
              <div
                key={`prep-${i}`}
                className="band prep"
                style={{
                  top: i * metrics.HEADER_ROW_HEIGHT,
                  height: metrics.HEADER_ROW_HEIGHT,
                  width,
                }}
              >
                {ps}
              </div>
            ))}

            {/* legend, only when groups are in play */}
            {layout.hasGroups && (
              <div
                className="band legend"
                style={{
                  top: metrics.HEADER_ROW_HEIGHT * layout.prepLines.length,
                  height: metrics.LEGEND_HEIGHT,
                  width,
                }}
              >
                {Object.entries(layout.groupColors).map(([name, color]) => (
                  <span className="swatch" key={name}>
                    <span className="dot" style={{ background: color }} />
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </span>
                ))}
              </div>
            )}

            {/* ingredient rows */}
            {recipe.ingredients.map((ing, i) => {
              const consumer = layout.consumedBy[ing.id];
              const consumed = Boolean(consumer && done.has(consumer));
              const group = layout.rowGroups[i];
              return (
                <div
                  key={ing.id}
                  data-ing-id={ing.id}
                  className={`ing-row${consumed ? " consumed" : ""}`}
                  style={{
                    top: layout.rowTop[i],
                    height: layout.rowHeights[i],
                    width: metrics.NAME_COL_WIDTH,
                  }}
                >
                  {group && (
                    <span
                      className="accent"
                      style={{ background: layout.groupColors[group] }}
                    />
                  )}
                  <span className="label">{layout.rowLabels[i]}</span>
                </div>
              );
            })}

            {/* divider banners — below step boxes in z-order, per Phase 1 */}
            {layout.dividerBlocks.map((d, i) => (
              <div
                key={`div-${i}`}
                className="divider"
                title={d.label}
                style={{
                  top: d.y,
                  height: d.h,
                  width,
                  background: d.color,
                  borderColor: d.color,
                  fontSize: dividerFontSize(width, d.label, compact ? 13 : 15),
                }}
              >
                <span className="divider-label">{d.label}</span>
              </div>
            ))}

            {/* step boxes */}
            {layout.stepBoxes.map((step) => {
              const x = columnX(layout, step.column, done);
              const w = columnWidth(layout, step.column, done);
              const collapsed = w === metrics.COLLAPSED_WIDTH;
              const isDone = done.has(step.id);
              const boxHeight =
                layout.rowTop[step.bottom] +
                layout.rowHeights[step.bottom] -
                layout.rowTop[step.top];

              let background = BG_COLOR;
              let borderColor = LINE_COLOR;
              if (step.groups.length === 1) {
                const color = layout.groupColors[step.groups[0]];
                background = blendWithWhite(color, GROUP_TINT_RATIO);
                borderColor = color;
              } else if (step.groups.length > 1) {
                const stops = step.groups
                  .map(
                    (g, i) =>
                      `${blendWithWhite(layout.groupColors[g], GROUP_TINT_RATIO)} ${
                        (i / (step.groups.length - 1)) * 100
                      }%`,
                  )
                  .join(", ");
                background = `linear-gradient(to right, ${stops})`;
                borderColor = MERGE_BORDER_COLOR;
              }

              return (
                <button
                  type="button"
                  key={step.id}
                  data-step-id={step.id}
                  data-column={step.column}
                  data-collapsed={collapsed ? "true" : "false"}
                  aria-pressed={isDone}
                  aria-label={`${step.action}${isDone ? " (done)" : ""}`}
                  className={`step-box${isDone ? " done" : ""}${collapsed ? " collapsed" : ""}`}
                  onClick={() => toggle(step.id)}
                  style={{
                    left: x,
                    top: layout.rowTop[step.top],
                    width: w,
                    height: boxHeight,
                    background,
                    borderColor,
                    opacity: isDone ? 0.7 : 1,
                  }}
                >
                  <span className="check">{isDone ? "✓" : ""}</span>
                  <span className="action-text">{step.action}</span>
                  {step.paramLines.map((p) => (
                    <span className="params" key={p}>
                      {p}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
        </div>
      </div>

      <p className="hint">
        Tap a step to check it off. A column collapses once every step in it is
        done, and the columns to its right slide left to fill the gap.
        {allDone ? "" : " Ingredients grey out as soon as they go in."}
      </p>

      <style jsx>{`
        .cook {
          margin-top: 8px;
        }
        .cook-toolbar {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .progress-wrap {
          flex: 0 0 140px;
          height: 8px;
          border-radius: 999px;
          background: #e6e3d6;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: ${LINE_COLOR};
          transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .progress-text {
          font-size: 13px;
          color: #52514e;
        }
        .scaler {
          transform-origin: top left;
          transition: transform 0.25s ease;
          width: max-content;
        }
        .board-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 12px;
          -webkit-overflow-scrolling: touch;
        }
        .card {
          position: relative;
          background: #fdf7d8;
          border-radius: 24px;
          padding: ${metrics.PAD}px;
          transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .board {
          position: relative;
          background: ${BG_COLOR};
          border: 3px solid ${LINE_COLOR};
          border-radius: 18px;
          overflow: hidden;
          transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .band {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          border: 2px solid ${LINE_COLOR};
          font-size: 16px;
          padding: 4px 10px;
          background: ${BG_COLOR};
          transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .legend {
          font-size: 13px;
          justify-content: flex-start;
          gap: 20px;
          padding-left: 16px;
        }
        .ing-row {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          border: 2px solid ${LINE_COLOR};
          background: ${BG_COLOR};
          padding: 6px 14px;
          font-size: 14px;
          line-height: 1.3;
          transition:
            opacity 0.35s ease,
            color 0.35s ease;
        }
        .ing-row.consumed {
          opacity: 0.4;
          text-decoration: line-through;
        }
        .divider {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 600;
          font-style: italic;
          border: 2px solid;
          overflow: hidden;
          padding: 0 12px;
          z-index: 2;
          transition:
            width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
            font-size 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .step-box {
          position: absolute;
          border: 3px solid ${LINE_COLOR};
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-family: inherit;
          font-weight: 700;
          font-size: 15px;
          color: #1a1a1a;
          cursor: pointer;
          user-select: none;
          padding: 6px;
          /* Cooking instructions are phrases, not one-word verbs — let them
             wrap rather than overflow into the neighbouring column. */
          white-space: normal;
          overflow-wrap: anywhere;
          line-height: 1.2;
          transition:
            left 0.45s cubic-bezier(0.4, 0, 0.2, 1),
            width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
            background 0.3s ease,
            opacity 0.3s ease;
          z-index: 3;
        }
        .step-box:hover {
          filter: brightness(0.97);
        }
        .step-box:focus-visible {
          outline: 3px solid #2a78d6;
          outline-offset: 2px;
        }
        .step-box.done .action-text {
          text-decoration: line-through;
          opacity: 0.55;
        }
        .compact .band {
          font-size: 13px;
          padding: 3px 6px;
        }
        .compact .legend {
          font-size: 11px;
          padding-left: 10px;
        }
        .compact .ing-row {
          font-size: 12px;
          padding: 4px 8px;
        }
        .compact .step-box {
          font-size: 12.5px;
          padding: 4px;
        }
        .hint {
          font-size: 12px;
          color: #898781;
          margin-top: 12px;
          max-width: 640px;
          line-height: 1.5;
        }
        .ghost-button {
          font: inherit;
          font-size: 13px;
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid ${LINE_COLOR};
          background: #fff;
          color: ${LINE_COLOR};
          cursor: pointer;
          font-weight: 600;
        }
        .ghost-button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        @media (prefers-reduced-motion: reduce) {
          .card,
          .board,
          .band,
          .divider,
          .step-box,
          .progress-bar {
            transition: none;
          }
        }
      `}</style>
      <style jsx global>{`
        .ing-row .accent {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 5px;
        }
        .ing-row .label {
          padding-left: 8px;
        }
        .legend .swatch {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-right: 20px;
          font-weight: 500;
        }
        .legend .dot {
          width: 13px;
          height: 13px;
          border-radius: 3px;
          display: inline-block;
        }
        .divider .divider-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .step-box .check {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid ${LINE_COLOR};
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #fff;
        }
        .step-box.done .check {
          background: ${LINE_COLOR};
        }
        .step-box.collapsed {
          padding: 4px;
        }
        .step-box.collapsed .action-text,
        .step-box.collapsed .params {
          display: none;
        }
        .step-box.collapsed .check {
          position: static;
        }
        .step-box .params {
          font-weight: 500;
          font-size: 12px;
          margin-top: 3px;
        }
      `}</style>
    </div>
  );
}
