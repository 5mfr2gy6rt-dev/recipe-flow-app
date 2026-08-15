"use client";

/**
 * Shared cook-mode link. The recipe travels in the URL fragment, so opening one
 * costs nothing, needs no database, and never sends the recipe to the server.
 */

import { useEffect, useMemo, useState } from "react";

import CookMode from "@/components/CookMode";
import Warnings from "@/components/Warnings";
import { computeLayout } from "@/lib/layout";
import { decodeRecipe } from "@/lib/share";
import type { Recipe, UnitSystem } from "@/lib/types";

export default function CookPage() {
  const [state, setState] = useState<
    { recipe: Recipe; units: UnitSystem } | null | "invalid"
  >(null);

  useEffect(() => {
    let cancelled = false;
    void decodeRecipe(window.location.hash).then((r) => {
      if (!cancelled) setState(r ?? "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const layout = useMemo(
    () =>
      state && state !== "invalid"
        ? computeLayout(state.recipe, state.units)
        : null,
    [state],
  );

  if (state === null) {
    return (
      <main>
        <p className="dim">Loading…</p>
        <style jsx>{`
          main {
            max-width: 1100px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          .dim {
            color: #8a8880;
          }
        `}</style>
      </main>
    );
  }

  if (state === "invalid") {
    return (
      <main>
        <h1>That link didn&rsquo;t open</h1>
        <p>
          The recipe data in the link is missing or damaged — links can get cut
          short by chat apps that shorten long URLs.{" "}
          <a href="/">Make a new diagram</a>.
        </p>
        <style jsx>{`
          main {
            max-width: 640px;
            margin: 0 auto;
            padding: 60px 20px;
            line-height: 1.6;
          }
          h1 {
            font-size: 22px;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>{state.recipe.title}</h1>
        <a href="/" className="back">
          Make your own →
        </a>
      </header>
      {layout && <Warnings warnings={layout.warnings} />}
      <CookMode recipe={state.recipe} units={state.units} />
      <style jsx>{`
        main {
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 20px 70px;
        }
        header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        h1 {
          font-size: 22px;
          margin: 0;
        }
        .back {
          font-size: 13px;
          color: #2f7d4f;
          font-weight: 600;
          text-decoration: none;
        }
      `}</style>
    </main>
  );
}
