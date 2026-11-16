import { notImplemented } from "../../not-implemented.js"
import type { PolicyResult } from "../../types.js"
import type { CoverageThresholds } from "../coverage.js"

/**
 * Judges a `coverage-summary.json` against thresholds. Fails on a judged metric below its
 * threshold, on a missing `total`, and when every metric reads `"Unknown"` (nothing was
 * instrumented).
 * @param summary - the parsed summary.
 * @param thresholds - the minimum per metric.
 * @returns the verdict.
 */
export function evaluateCoverageSummary(
  summary: unknown,
  thresholds: CoverageThresholds,
): PolicyResult {
  return notImplemented("R7b", summary, thresholds)
}
