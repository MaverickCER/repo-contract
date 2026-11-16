import { notImplementedCheck } from "../not-implemented.js"
import type { CheckDefinitionConfig } from "../types.js"

/** Minimum coverage per metric, in percent. A metric left out is not judged. */
export interface CoverageThresholds {
  readonly lines?: number
  readonly statements?: number
  readonly functions?: number
  readonly branches?: number
}

/** Options accepted by {@link coverage}. */
export interface CoverageOptions {
  /** Defaults to 80 on lines and statements. */
  readonly thresholds?: CoverageThresholds
  /** The `json-summary` report a test run wrote. Defaults to `"coverage/coverage-summary.json"`. */
  readonly summary?: string
}

/**
 * The Vitest flags that make a test run write the two reports `coverage` and `crap` read:
 * `coverage-summary.json` and `coverage-final.json`. Tiers append them to the `Tests` check.
 * Not exported from the barrel: it is wiring, not a preset.
 */
export const COVERAGE_VITEST_ARGS: readonly string[] = []

/**
 * Package-wide test coverage, read from the `json-summary` report a test run wrote. It runs no
 * tests: declare `dependsOn` on the check that does. Fails on any judged metric below its
 * threshold, and when the report is missing or unreadable.
 * @param options - configuration for this check; see {@link CoverageOptions}.
 * @returns the configured check.
 * @beta
 */
export function coverage(options: CoverageOptions = {}): CheckDefinitionConfig {
  return notImplementedCheck("R7b", options)
}
