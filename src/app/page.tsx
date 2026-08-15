"use client";

import { useEffect, useMemo, useState } from "react";

import CookMode from "@/components/CookMode";
import Editor from "@/components/Editor";
import InputPanel, { type ExtractRequest } from "@/components/InputPanel";
import StaticDiagram from "@/components/StaticDiagram";
import Warnings from "@/components/Warnings";
import { computeLayout } from "@/lib/layout";
import { buildShareUrl, decodeRecipe } from "@/lib/share";
import { loadRecents, removeRecent, saveRecent, type RecentEntry } from "@/lib/storage";
import type { Recipe, UnitSystem, Warning } from "@/lib/types";

type View = "diagram" | "cook" | "edit";

const UNIT_LABELS: Record<UnitSystem, string> = {
  source: "As written",
  imperial: "Imperial",
  metric: "Metric",
};

export default function Home() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [units, setUnits] = useState<UnitSystem>("source");
  const [view, setView] = useState<View>("diagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [serverWarnings, setServerWarnings] = useState<Warning[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  useEffect(() => setRecents(loadRecents()), []);

  // A recipe can also arrive in the URL fragment — that's what "Share cook
  // mode" produces, and it's how the demo links work with no API key at all.
  // Landing here rather than on /cook gives the full set of views.
  useEffect(() => {
    if (!window.location.hash) return;
    void decodeRecipe(window.location.hash).then((r) => {
      if (!r) return;
      setRecipe(r.recipe);
      setUnits(r.units);
      setView("diagram");
    });
  }, []);

  const layout = useMemo(
    () => (recipe ? computeLayout(recipe, units) : null),
    [recipe, units],
  );

  async function extract(req: ExtractRequest) {
    setBusy(true);
    setError(null);
    setNotes("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed.");
      setRecipe(json.recipe as Recipe);
      setServerWarnings((json.warnings as Warning[]) || []);
      setNotes(json.notes || "");
      setView("diagram");
      saveRecent(json.recipe as Recipe, units);
      setRecents(loadRecents());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!recipe) return;
    const url = await buildShareUrl(recipe, units);
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2200);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  // Once the user edits, the server's warnings are stale — the live layout
  // recomputes them anyway.
  const warnings = layout ? layout.warnings : serverWarnings;

  return (
    <main>
      <header>
        <h1>Recipe Flow Maker</h1>
        <p className="tagline">
          If you hate long recipes, add your recipe in any format to turn it
          into a recipe flow chart
        </p>
      </header>

      <section className="input-card">
        <InputPanel busy={busy} onSubmit={extract} />
        {error && <p className="error">{error}</p>}
        {!recipe && (
          <p className="try">
            <a href="/demo">Try a sample recipe →</a>
          </p>
        )}
      </section>

      {!recipe && recents.length > 0 && (
        <section className="recents">
          <h2>Recent recipes</h2>
          <ul>
            {recents.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setRecipe(r.recipe);
                    setUnits(r.units);
                    setView("diagram");
                  }}
                >
                  {r.title}
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={`Forget ${r.title}`}
                  onClick={() => setRecents(removeRecent(r.key))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe && layout && (
        <section className="result">
          <div className="result-head">
            <h2>{recipe.title}</h2>
            <div className="controls">
              <div className="segmented" role="tablist" aria-label="View">
                {(["diagram", "cook", "edit"] as View[]).map((v) => (
                  <button
                    type="button"
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    className={view === v ? "seg on" : "seg"}
                    onClick={() => setView(v)}
                  >
                    {v === "diagram"
                      ? "Diagram"
                      : v === "cook"
                        ? "Cook mode"
                        : "Edit"}
                  </button>
                ))}
              </div>
              <div className="segmented" aria-label="Units">
                {(["source", "imperial", "metric"] as UnitSystem[]).map((u) => (
                  <button
                    type="button"
                    key={u}
                    aria-pressed={units === u}
                    className={units === u ? "seg on" : "seg"}
                    onClick={() => setUnits(u)}
                  >
                    {UNIT_LABELS[u]}
                  </button>
                ))}
              </div>
              <button type="button" className="ghost-button" onClick={share}>
                {shareState === "copied" ? "Link copied" : "Share cook mode"}
              </button>
            </div>
          </div>

          {notes && <p className="notes">{notes}</p>}
          {view !== "edit" && <Warnings warnings={warnings} />}

          {view === "diagram" && (
            <StaticDiagram recipe={recipe} layout={layout} units={units} />
          )}
          {view === "cook" && (
            <CookMode key={units} recipe={recipe} units={units} />
          )}
          {view === "edit" && (
            <Editor recipe={recipe} units={units} onChange={setRecipe} />
          )}
        </section>
      )}

      <style jsx>{`
        main {
          max-width: 1100px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }
        header {
          margin-bottom: 26px;
        }
        h1 {
          font-size: 27px;
          margin: 0 0 6px;
          letter-spacing: -0.01em;
        }
        .tagline {
          margin: 0;
          color: #56554f;
          font-size: 15px;
          line-height: 1.6;
          max-width: 56ch;
        }
        .input-card {
          background: #fffdf4;
          border: 1px solid #e4e0d0;
          border-radius: 16px;
          padding: 18px;
        }
        .try {
          margin: 14px 0 0;
          font-size: 13px;
          color: #6b6a65;
        }
        .try a {
          color: #2f7d4f;
          font-weight: 600;
          text-decoration: none;
        }
        .try a:hover {
          text-decoration: underline;
        }
        .error {
          margin: 12px 0 0;
          color: #a5391a;
          font-size: 13.5px;
          line-height: 1.55;
        }
        .recents {
          margin-top: 28px;
        }
        .recents h2 {
          font-size: 14px;
          color: #6b6a65;
          margin: 0 0 8px;
        }
        .recents ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .recents li {
          display: flex;
          align-items: center;
          gap: 2px;
          background: #fff;
          border: 1px solid #e0dccc;
          border-radius: 999px;
          padding: 3px 6px 3px 12px;
        }
        .link {
          font: inherit;
          font-size: 13px;
          background: none;
          border: none;
          cursor: pointer;
          color: #2f7d4f;
          font-weight: 600;
        }
        .result {
          margin-top: 34px;
        }
        .result-head {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .result-head h2 {
          font-size: 19px;
          margin: 0;
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .segmented {
          display: inline-flex;
          border: 1px solid #dcd8c8;
          border-radius: 999px;
          overflow: hidden;
          background: #fff;
        }
        .notes {
          background: #f3f6fb;
          border: 1px solid #c8d8ef;
          color: #23405f;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13px;
          line-height: 1.55;
          margin: 0 0 14px;
        }
      `}</style>
    </main>
  );
}
