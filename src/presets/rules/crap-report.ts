import { notImplemented } from "../../not-implemented.js"
import type { PolicyResult } from "../../types.js"

/**
 * Judges a crap4ts JSON report. Fails on a function above either ceiling, and on a function whose
 * score or complexity is not a finite number.
 * @param report - the parsed report.
 * @param limits - the ceilings.
 * @param limits.threshold - the highest CRAP score allowed.
 * @param limits.maxComplexity - the highest cyclomatic complexity allowed.
 * @returns the verdict.
 */
export function evaluateCrapReport(
  report: unknown,
  limits: { readonly threshold: number; readonly maxComplexity: number },
): PolicyResult {
  return notImplemented("R7b", report, limits)
}
