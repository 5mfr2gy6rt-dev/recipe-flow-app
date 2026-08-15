"use client";

/**
 * Phase 1's contiguity check printed to stderr, where a developer was watching.
 * Here nobody is, so the same checks surface in the interface — a box drawn
 * silently around the wrong ingredients is worse than no diagram.
 */

import type { Warning } from "@/lib/types";

export default function Warnings({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) return null;
  const errors = warnings.filter((w) => w.level === "error");
  const soft = warnings.filter((w) => w.level === "warning");

  return (
    <div className="warnings">
      {errors.length > 0 && (
        <div className="block error">
          <strong>
            {errors.length === 1 ? "Something needs fixing" : "Some things need fixing"}
          </strong>
          <ul>
            {errors.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {soft.length > 0 && (
        <div className="block warn">
          <strong>Worth a look</strong>
          <ul>
            {soft.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      <style jsx>{`
        .warnings {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .block {
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13px;
          line-height: 1.55;
          border: 1px solid;
        }
        .error {
          background: #fdf0ec;
          border-color: #eb6834;
          color: #7a2f10;
        }
        .warn {
          background: #fdf8e8;
          border-color: #d9b23a;
          color: #6b5410;
        }
        strong {
          display: block;
          margin-bottom: 4px;
        }
        ul {
          margin: 0;
          padding-left: 18px;
        }
        li + li {
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
