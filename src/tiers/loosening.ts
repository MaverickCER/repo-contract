import type { TierCheckId, TierSettings } from "./types.js"

/** Which way a setting gets stricter. */
export type LooseningDirection = "higher-is-stricter" | "lower-is-stricter"

/** One numeric setting `explain` compares, and which way it gets stricter. */
export interface LooseningRule {
  readonly check: TierCheckId & keyof TierSettings
  readonly setting: string
  readonly direction: LooseningDirection
}

/** How a configured value compares with its baseline. */
export type SettingComparison = "stricter" | "same" | "looser"

/**
 * Every numeric setting `explain` compares. Coverage and the mutation score are stricter higher.
 * The duplication budget and the CRAP and complexity ceilings are stricter lower. A check turned
 * off is always looser, and needs no rule.
 */
export const LOOSENING_RULES: readonly LooseningRule[] = [
  { check: "Coverage", setting: "lines", direction: "higher-is-stricter" },
  { check: "Coverage", setting: "statements", direction: "higher-is-stricter" },
  { check: "Coverage", setting: "functions", direction: "higher-is-stricter" },
  { check: "Coverage", setting: "branches", direction: "higher-is-stricter" },
  { check: "Duplication", setting: "maxPercentage", direction: "lower-is-stricter" },
  { check: "Crap", setting: "threshold", direction: "lower-is-stricter" },
  { check: "Crap", setting: "maxComplexity", direction: "lower-is-stricter" },
  { check: "Mutation", setting: "minScore", direction: "higher-is-stricter" },
]

/**
 * Compares one setting with its baseline. A value the baseline sets but the config leaves out
 * (a coverage metric no longer judged) is looser; one only the config sets is stricter.
 * @param direction - which way the setting gets stricter.
 * @param baseline - the baseline's value, or `undefined` when the baseline does not judge it.
 * @param value - the config's value, or `undefined` when the config does not judge it.
 * @returns whether the config is stricter, the same or looser.
 */
export function compareSetting(
  direction: LooseningDirection,
  baseline: number | undefined,
  value: number | undefined,
): SettingComparison {
  if (value === undefined) return baseline === undefined ? "same" : "looser"
  if (baseline === undefined) return "stricter"
  // Positive when the config is stricter, whichever way the setting points.
  const gain = direction === "higher-is-stricter" ? value - baseline : baseline - value
  if (gain > 0) return "stricter"
  return gain < 0 ? "looser" : "same"
}
