import type { PolicyResult } from "../../types.js"
import { shownValue } from "./option-checks.js"

/** Minimum coverage per metric, in percent. A metric left out is not judged. */
export interface CoverageThresholds {
  readonly lines?: number
  readonly statements?: number
  readonly functions?: number
  readonly branches?: number
}

const METRICS = ["lines", "statements", "functions", "branches"] as const

/**
 * Reads one metric's percentage, or `undefined` when it is not a finite number.
 * @param total - the summary's `total` section.
 * @param metric - the metric's key.
 * @returns the percentage.
 */
function percentage(total: Readonly<Record<string, unknown>>, metric: string): number | undefined {
  // `Object.hasOwn` keeps a metric named like an Object.prototype member from reading the prototype.
  const entry = Object.hasOwn(total, metric) ? total[metric] : undefined
  const pct: unknown =
    typeof entry === "object" && entry !== null ? (entry as { pct?: unknown }).pct : undefined
  // `Number.isFinite` is false for anything that is not a number, so it needs no type guard.
  return Number.isFinite(pct) ? (pct as number) : undefined
}

/**
 * Whether every metric reads Istanbul's `"Unknown"`, which it prints for `0/0`: nothing was
 * instrumented. One message then replaces four identical "missing" lines.
 * @param total - the summary's `total` section.
 * @returns `true` when there is at least one metric and every one reads `"Unknown"`.
 */
function nothingInstrumented(total: Readonly<Record<string, unknown>>): boolean {
  const entries = Object.values(total)
  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { pct?: unknown }).pct === "Unknown",
    )
  )
}

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
  const judged = METRICS.flatMap((metric) => {
    const threshold = thresholds[metric]
    return threshold === undefined ? [] : [{ metric, threshold }]
  })

  const total: unknown =
    typeof summary === "object" && summary !== null
      ? (summary as { total?: unknown }).total
      : undefined
  if (typeof total !== "object" || total === null) {
    return { outcome: "fail", rationale: "Coverage: the summary has no `total` section." }
  }
  const metrics = total as Readonly<Record<string, unknown>>

  if (nothingInstrumented(metrics)) {
    return {
      outcome: "fail",
      rationale:
        "Coverage: the test run instrumented no code, so every metric reads Unknown. Add source files and tests for them; the check scores once the test run covers real code.",
    }
  }

  if (judged.length === 0) {
    return { outcome: "pass", rationale: "Coverage judged no metric: no threshold is set." }
  }

  const failures: string[] = []
  const met: string[] = []
  for (const { metric, threshold } of judged) {
    const pct = percentage(metrics, metric)
    if (pct === undefined) {
      failures.push(`${metric}: the percentage is missing or not a number`)
    } else if (pct < threshold) {
      failures.push(
        `${metric}: ${String(pct)}% actual, ${String(threshold)}% required, ${(threshold - pct).toFixed(2)} points short`,
      )
    } else {
      met.push(`${metric} ${String(pct)}% (${String(threshold)}% required)`)
    }
  }

  if (failures.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `Coverage is below ${String(failures.length)} threshold(s):`,
        ...failures.map((failure) => `- ${failure}`),
      ].join("\n"),
    }
  }
  return { outcome: "pass", rationale: `Coverage met every threshold: ${met.join(", ")}.` }
}

/**
 * Checks thresholds when the config loads, so a typo such as 800 for 80.0 fails before any test
 * runs.
 * @param thresholds - the `coverage` `thresholds` option.
 * @returns the same thresholds.
 * @throws {RangeError} when they are not an object, name an unknown metric, or set a metric
 * outside 0 to 100.
 */
export function checkCoverageThresholds(thresholds: unknown): CoverageThresholds {
  if (typeof thresholds !== "object" || thresholds === null || Array.isArray(thresholds)) {
    throw new RangeError("coverage: thresholds must be an object keyed by metric.")
  }
  for (const [metric, threshold] of Object.entries(thresholds)) {
    if (!(METRICS as readonly string[]).includes(metric)) {
      throw new RangeError(
        `coverage: thresholds has no metric "${metric}". The metrics are lines, statements, functions and branches.`,
      )
    }
    // A metric set to `undefined` is not judged, as when it is left out.
    if (
      threshold !== undefined &&
      !(typeof threshold === "number" && threshold >= 0 && threshold <= 100)
    ) {
      throw new RangeError(
        `coverage: thresholds.${metric} must be a number from 0 to 100, got ${shownValue(threshold)}.`,
      )
    }
  }
  return thresholds
}
