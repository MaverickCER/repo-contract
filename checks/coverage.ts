import { COVERAGE_THRESHOLDS } from "../scripts/coverage-thresholds.mjs"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface CoverageMetric {
  readonly pct: number
}

export interface CoverageSummary {
  readonly branches: CoverageMetric
  readonly functions: CoverageMetric
  readonly lines: CoverageMetric
  readonly statements: CoverageMetric
}

/**
 * The coverage check's full interpretation logic, factored out so
 * test/unit/coverage/policy.test.ts can exercise every threshold comparison directly against
 * already-parsed evidence, without spawning scripts/check-coverage.mjs -- matching every other
 * check's own `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - the coverage check's own parsed output: aggregate percentages, per metric.
 * @returns the pass/fail verdict.
 */
export function evaluateCoveragePolicy({
  evidence,
}: {
  readonly evidence: Partial<CoverageSummary>
}): PolicyResult {
  const total = evidence
  const failures: string[] = []

  for (const [metric, threshold] of Object.entries(COVERAGE_THRESHOLDS)) {
    const actual = total[metric as keyof CoverageSummary]?.pct

    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      failures.push(`${metric}: coverage percentage is missing or invalid`)
      continue
    }

    if (actual < threshold) {
      failures.push(
        `${metric}: ${String(actual)}% actual, ${String(threshold)}% required, ${(threshold - actual).toFixed(2)} percentage points below threshold`,
      )
    }
  }

  const formatSummary = (summary: Partial<CoverageSummary>): string =>
    Object.keys(COVERAGE_THRESHOLDS)
      .map((metric) => {
        const pct = summary[metric as keyof CoverageSummary]?.pct
        return `${metric}: ${typeof pct === "number" ? `${String(pct)}%` : "missing"}`
      })
      .join(", ")

  if (failures.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "Coverage thresholds were not met:",
        ...failures.map((failure) => `- ${failure}`),
        "",
        "Coverage:",
        `- ${formatSummary(total)}`,
      ].join("\n"),
    }
  }

  return {
    outcome: "pass",
    rationale: `Coverage thresholds were met (${formatSummary(total)}).`,
  }
}

// Aggregation and reporting only -- never executes tests, never discovers
// test files. repo-contract.config.ts's `dependsOn` on this check guarantees
// the three coverage-producing categories have already run (and therefore
// already written coverage/{unit,integration,property}/coverage-final.json)
// before this runs; see scripts/check-coverage.mjs and
// scripts/aggregate-coverage.mjs.
export const coverage: CheckDefinitionConfig = {
  run: ["node", "scripts/check-coverage.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<Partial<CoverageSummary>>(
      result.output,
      "Coverage output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateCoveragePolicy({ evidence: parsed.value })
  },
}
