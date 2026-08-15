"use client";

/**
 * Static diagram view — the export-and-print format, rendered by the same
 * TypeScript port of render_recipe_diagram.py that the parity check runs
 * against, so what you download here is what the Phase 1 skill would have
 * produced for the same JSON.
 */

import { useMemo, useState } from "react";

import { buildSvg } from "@/lib/svg";
import type { Layout } from "@/lib/layout";
import type { Recipe, UnitSystem } from "@/lib/types";

interface Props {
  recipe: Recipe;
  layout: Layout;
  units: UnitSystem;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "recipe"
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StaticDiagram({ recipe, layout, units }: Props) {
  const [busy, setBusy] = useState(false);
  const svg = useMemo(
    () => buildSvg(recipe, units, layout),
    [recipe, units, layout],
  );
  const name = slug(recipe.title);

  function downloadSvg() {
    download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
  }

  async function downloadPng() {
    setBusy(true);
    try {
      const scale = 2;
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not rasterise the diagram."));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = (layout.totalWidth + 28) * scale;
      canvas.height = (layout.totalHeight + 28) * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (png) download(png, `${name}.png`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row gap">
        <button type="button" className="ghost-button" onClick={downloadSvg}>
          Download SVG
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={downloadPng}
          disabled={busy}
        >
          {busy ? "Rendering…" : "Download PNG"}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      <div
        className="static-diagram"
        // The SVG is built from our own escaped serialiser, not from remote HTML.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <style jsx>{`
        .row {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .gap {
          gap: 10px;
        }
        .static-diagram {
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .static-diagram :global(svg) {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
