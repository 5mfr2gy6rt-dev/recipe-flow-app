/**
 * Shared recipe schema — ported verbatim from the Phase 1 skill (SKILL.md) so
 * that JSON produced by the skill loads into this app unchanged, and vice versa.
 *
 * The only addition over Phase 1 is the optional `quantity_imperial` /
 * `quantity_metric` fields, which back the display-unit toggle. `quantity`
 * remains the source-verbatim string and is what renders by default.
 */

export interface Ingredient {
  id: string;
  name: string;
  quantity?: string;
  /** Optional conversions, only filled when they can be derived confidently. */
  quantity_imperial?: string;
  quantity_metric?: string;
  group?: string;
}

export interface Divider {
  before_id: string;
  label: string;
  group?: string;
}

export interface Step {
  id: string;
  action: string;
  inputs: string[];
  params?: Record<string, string>;
}

export interface Recipe {
  title: string;
  prep_steps: string[];
  ingredients: Ingredient[];
  dividers?: Divider[];
  steps: Step[];
  /** Provenance, set by the extraction API. Not used by layout. */
  source?: { kind: "url" | "photo" | "text"; url?: string };
}

export type UnitSystem = "source" | "imperial" | "metric";

export type WarningLevel = "error" | "warning";

export interface Warning {
  level: WarningLevel;
  code:
    | "unknown_input"
    | "forward_reference"
    | "duplicate_id"
    | "no_steps"
    | "noncontiguous_inputs"
    | "too_many_groups"
    | "orphan_ingredient"
    | "divider_mismatch";
  message: string;
  /** Ids the warning is about, so the editor can highlight them. */
  refs?: string[];
}
