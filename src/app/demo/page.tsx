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
import DishIcon, { type DishKind } from "@/components/DishIcon";
import { encodeRecipe } from "@/lib/share";
import type { Recipe } from "@/lib/types";

const SAMPLES: { recipe: Recipe; icon: DishKind }[] = [
  { recipe: brownies as Recipe, icon: "brownies" },
  { recipe: cookies as Recipe, icon: "cookies" },
  { recipe: lemonBars as Recipe, icon: "lemon-bars" },
  { recipe: tofu as Recipe, icon: "tofu" },
  { recipe: chole as Recipe, icon: "chole" },
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
      <ul>
        {SAMPLES.map((s, i) => (
          <li key={s.recipe.title}>
            <DishIcon kind={s.icon} />
            {links[i] ? (
              <a href={links[i]}>{s.recipe.title}</a>
            ) : (
              <span className="pending">{s.recipe.title}</span>
            )}
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
          flex-direction: row;
          align-items: center;
          gap: 12px;
          background: #fffdf4;
          border: 1px solid #e4e0d0;
          border-radius: 12px;
          padding: 10px 16px;
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
