"use client";

/**
 * Sample recipes, built in. Extraction costs an API call; browsing what the app
 * does shouldn't. These are the five recipes Phase 1 was validated against, so
 * this doubles as the manual test set.
 */

import { useEffect, useState } from "react";

import brownies from "../../../fixtures/brownies.json";
import cookies from "../../../fixtures/chocolate-chip-cookies.json";
import tofu from "../../../fixtures/honey-garlic-tofu.json";
import lemonBars from "../../../fixtures/lemon-bars.json";
import chole from "../../../fixtures/punjabi-chole.json";
import { encodeRecipe } from "@/lib/share";
import type { Recipe } from "@/lib/types";

const SAMPLES: { recipe: Recipe; note: string }[] = [
  { recipe: brownies as Recipe, note: "The reference-photo shape — a simple top-to-bottom staircase." },
  { recipe: cookies as Recipe, note: "A long staircase: one ingredient added at a time." },
  { recipe: lemonBars as Recipe, note: "Two branches — crust made before the filling — with colour coding." },
  { recipe: tofu as Recipe, note: "Breading and sauce made independently, combined at the end. Best cook-mode demo." },
  { recipe: chole as Recipe, note: "Stovetop, long sequential build, wrapped phrase labels." },
];

export default function DemoPage() {
  const [links, setLinks] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all(
      SAMPLES.map(async (s) => `/#${await encodeRecipe(s.recipe, "source")}`),
    ).then(setLinks);
  }, []);

  return (
    <main>
      <h1>Sample recipes</h1>
      <p className="lede">
        Open any of these to see the app working — no API key and no extraction
        call. The recipe travels in the link itself.
      </p>
      <ul>
        {SAMPLES.map((s, i) => (
          <li key={s.recipe.title}>
            {links[i] ? (
              <a href={links[i]}>{s.recipe.title}</a>
            ) : (
              <span className="pending">{s.recipe.title}</span>
            )}
            <span className="note">{s.note}</span>
          </li>
        ))}
      </ul>
      <p className="back">
        <a href="/">← Back to the app</a>
      </p>

      <style jsx>{`
        main {
          max-width: 640px;
          margin: 0 auto;
          padding: 48px 20px 80px;
        }
        h1 {
          font-size: 24px;
          margin: 0 0 8px;
        }
        .lede {
          color: #56554f;
          font-size: 15px;
          line-height: 1.6;
          margin: 0 0 26px;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        li {
          display: flex;
          flex-direction: column;
          gap: 3px;
          background: #fffdf4;
          border: 1px solid #e4e0d0;
          border-radius: 12px;
          padding: 14px 16px;
        }
        a {
          color: #2f7d4f;
          font-weight: 700;
          font-size: 16px;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .pending {
          font-weight: 700;
          font-size: 16px;
          color: #a8a69e;
        }
        .note {
          color: #6b6a65;
          font-size: 13px;
          line-height: 1.5;
        }
        .back {
          margin-top: 28px;
          font-size: 14px;
        }
        .back a {
          font-weight: 600;
          font-size: 14px;
        }
      `}</style>
    </main>
  );
}
