"use client";

/**
 * Pre-render editor. Extraction gets things wrong sometimes, and the two
 * failure modes that matter most — an ingredient list ordered so a step's
 * inputs aren't contiguous, and a merge structure that misreads an
 * instruction — are both cheap to fix by hand and expensive to fix by
 * re-extracting. Warnings recompute live as you edit.
 */

import { useMemo } from "react";

import { computeLayout } from "@/lib/layout";
import type { Ingredient, Recipe, Step, UnitSystem } from "@/lib/types";
import Warnings from "./Warnings";

interface Props {
  recipe: Recipe;
  units: UnitSystem;
  onChange: (recipe: Recipe) => void;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function Editor({ recipe, units, onChange }: Props) {
  const layout = useMemo(() => computeLayout(recipe, units), [recipe, units]);

  const groupNames = useMemo(() => {
    const names = new Set<string>();
    for (const i of recipe.ingredients) if (i.group) names.add(i.group);
    return [...names];
  }, [recipe.ingredients]);

  function patch(p: Partial<Recipe>) {
    onChange({ ...recipe, ...p });
  }

  function patchIngredient(index: number, p: Partial<Ingredient>) {
    const next = recipe.ingredients.slice();
    next[index] = { ...next[index], ...p };
    patch({ ingredients: next });
  }

  function patchStep(index: number, p: Partial<Step>) {
    const next = recipe.steps.slice();
    next[index] = { ...next[index], ...p };
    patch({ steps: next });
  }

  function toggleInput(stepIndex: number, id: string) {
    const step = recipe.steps[stepIndex];
    const inputs = step.inputs.includes(id)
      ? step.inputs.filter((x) => x !== id)
      : [...step.inputs, id];
    patchStep(stepIndex, { inputs });
  }

  return (
    <div className="editor">
      <Warnings warnings={layout.warnings} />

      <label className="field">
        <span>Title</span>
        <input
          value={recipe.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>

      <section>
        <h3>Prep steps</h3>
        <p className="note">
          Full-width header rows. Only things that depend on no ingredients.
        </p>
        {(recipe.prep_steps || []).map((ps, i) => (
          <div className="line" key={i}>
            <input
              value={ps}
              onChange={(e) => {
                const next = (recipe.prep_steps || []).slice();
                next[i] = e.target.value;
                patch({ prep_steps: next });
              }}
            />
            <button
              type="button"
              className="icon"
              aria-label="Remove prep step"
              onClick={() =>
                patch({
                  prep_steps: (recipe.prep_steps || []).filter(
                    (_, j) => j !== i,
                  ),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ghost-button small"
          onClick={() =>
            patch({ prep_steps: [...(recipe.prep_steps || []), ""] })
          }
        >
          Add prep step
        </button>
      </section>

      <section>
        <h3>Ingredients</h3>
        <p className="note">
          Order matters: each step&rsquo;s inputs have to sit together as one
          block, or its box will cover ingredients it never touches.
        </p>
        {recipe.ingredients.map((ing, i) => (
          <div className="ing" key={ing.id}>
            <div className="reorder">
              <button
                type="button"
                className="icon"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() =>
                  patch({ ingredients: move(recipe.ingredients, i, i - 1) })
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="icon"
                aria-label="Move down"
                disabled={i === recipe.ingredients.length - 1}
                onClick={() =>
                  patch({ ingredients: move(recipe.ingredients, i, i + 1) })
                }
              >
                ↓
              </button>
            </div>
            <input
              className="qty"
              value={ing.quantity || ""}
              placeholder="quantity"
              onChange={(e) => patchIngredient(i, { quantity: e.target.value })}
            />
            <input
              className="grow"
              value={ing.name}
              placeholder="ingredient"
              onChange={(e) => patchIngredient(i, { name: e.target.value })}
            />
            <input
              className="group"
              list="group-names"
              value={ing.group || ""}
              placeholder="group"
              onChange={(e) =>
                patchIngredient(i, { group: e.target.value || undefined })
              }
            />
            <button
              type="button"
              className="icon"
              aria-label="Remove ingredient"
              onClick={() => {
                patch({
                  ingredients: recipe.ingredients.filter((_, j) => j !== i),
                  steps: recipe.steps.map((s) => ({
                    ...s,
                    inputs: s.inputs.filter((x) => x !== ing.id),
                  })),
                  dividers: (recipe.dividers || []).filter(
                    (d) => d.before_id !== ing.id,
                  ),
                });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <datalist id="group-names">
          {groupNames.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <button
          type="button"
          className="ghost-button small"
          onClick={() => {
            const id = `ing${Date.now().toString(36)}`;
            patch({
              ingredients: [
                ...recipe.ingredients,
                { id, name: "new ingredient", quantity: "" },
              ],
            });
          }}
        >
          Add ingredient
        </button>
      </section>

      {(recipe.dividers || []).length > 0 && (
        <section>
          <h3>Bowl dividers</h3>
          {(recipe.dividers || []).map((d, i) => (
            <div className="line" key={i}>
              <input
                value={d.label}
                onChange={(e) => {
                  const next = (recipe.dividers || []).slice();
                  next[i] = { ...next[i], label: e.target.value };
                  patch({ dividers: next });
                }}
              />
              <select
                value={d.before_id}
                onChange={(e) => {
                  const next = (recipe.dividers || []).slice();
                  next[i] = { ...next[i], before_id: e.target.value };
                  patch({ dividers: next });
                }}
              >
                {recipe.ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    before {ing.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon"
                aria-label="Remove divider"
                onClick={() =>
                  patch({
                    dividers: (recipe.dividers || []).filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Steps</h3>
        <p className="note">
          A step&rsquo;s inputs are ingredients or the output of an earlier step.
          Its column lands one past its slowest input, and its box spans every
          row that feeds it.
        </p>
        {recipe.steps.map((step, i) => {
          const available = [
            ...recipe.ingredients.map((ing) => ({
              id: ing.id,
              label: ing.name,
              kind: "ingredient" as const,
            })),
            ...recipe.steps.slice(0, i).map((s) => ({
              id: s.id,
              label: s.action,
              kind: "step" as const,
            })),
          ];
          return (
            <div className="step" key={step.id}>
              <div className="step-head">
                <div className="reorder">
                  <button
                    type="button"
                    className="icon"
                    aria-label="Move step up"
                    disabled={i === 0}
                    onClick={() => patch({ steps: move(recipe.steps, i, i - 1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon"
                    aria-label="Move step down"
                    disabled={i === recipe.steps.length - 1}
                    onClick={() => patch({ steps: move(recipe.steps, i, i + 1) })}
                  >
                    ↓
                  </button>
                </div>
                <input
                  className="grow"
                  value={step.action}
                  placeholder="action"
                  onChange={(e) => patchStep(i, { action: e.target.value })}
                />
                <input
                  className="param"
                  value={step.params?.temp || ""}
                  placeholder="temp"
                  onChange={(e) =>
                    patchStep(i, {
                      params: { ...step.params, temp: e.target.value },
                    })
                  }
                />
                <input
                  className="param"
                  value={step.params?.time || ""}
                  placeholder="time"
                  onChange={(e) =>
                    patchStep(i, {
                      params: { ...step.params, time: e.target.value },
                    })
                  }
                />
                <button
                  type="button"
                  className="icon"
                  aria-label="Remove step"
                  onClick={() =>
                    patch({
                      steps: recipe.steps
                        .filter((_, j) => j !== i)
                        .map((s) => ({
                          ...s,
                          inputs: s.inputs.filter((x) => x !== step.id),
                        })),
                    })
                  }
                >
                  ×
                </button>
              </div>
              <div className="chips">
                {available.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`chip${step.inputs.includes(a.id) ? " on" : ""}${
                      a.kind === "step" ? " step-chip" : ""
                    }`}
                    onClick={() => toggleInput(i, a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="ghost-button small"
          onClick={() => {
            const id = `step${Date.now().toString(36)}`;
            patch({
              steps: [...recipe.steps, { id, action: "new step", inputs: [] }],
            });
          }}
        >
          Add step
        </button>
      </section>

      <style jsx>{`
        .editor {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        h3 {
          font-size: 15px;
          margin: 0 0 4px;
        }
        .note {
          font-size: 12.5px;
          color: #6b6a65;
          margin: 0 0 10px;
          line-height: 1.5;
          max-width: 62ch;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 13px;
          font-weight: 600;
        }
        .line,
        .ing,
        .step-head {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-bottom: 6px;
        }
        .step {
          border: 1px solid #e2dfd2;
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 8px;
          background: #fffdf4;
        }
        .reorder {
          display: flex;
          flex-direction: column;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 4px;
        }
        .qty {
          width: 110px;
          flex: none;
        }
        .group {
          width: 92px;
          flex: none;
        }
        .param {
          width: 84px;
          flex: none;
        }
        .grow {
          flex: 1 1 auto;
          min-width: 80px;
        }
        section {
          border-top: 1px solid #e6e3d6;
          padding-top: 16px;
        }
      `}</style>
    </div>
  );
}
