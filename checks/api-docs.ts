import type { ApiDocsEvidence, ApiDocsReportEvidence } from "../scripts/api-docs/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateApiDocsPolicyInput {
  readonly evidence: ApiDocsEvidence
}

/**
 * @param report - one target's evidence.
 * @returns a `- <detail>` line describing why `report` failed, or `undefined` if it didn't.
 */
function formatFailure(report: ApiDocsReportEvidence): string[] {
  const lines: string[] = []

  if (!report.upToDate) {
    lines.push(
      `- ${report.committedPath} is out of date with the real public surface -- run \`npm run api-docs:generate\` and commit the result.`,
    )
  }

  for (const marker of report.undocumentedMarkers) {
    lines.push(`- ${report.reportFileName}: ${marker}`)
  }

  return lines
}

/**
 * Fails whenever a generated API report (see docs/api-report/) no longer matches what API
 * Extractor produces from the package's real, current public surface, or still contains an
 * `(undocumented)`/`(No @packageDocumentation comment...)` marker -- naming exactly which report
 * and which symbol.
 * @param root0 - the policy input.
 * @param root0.evidence - the api-docs check's evidence to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateApiDocsPolicy({ evidence }: EvaluateApiDocsPolicyInput): PolicyResult {
  const failures = evidence.reports.flatMap(formatFailure)

  if (failures.length === 0) {
    return {
      outcome: "pass",
      rationale: `All ${String(evidence.reports.length)} generated API report(s) are up to date and fully documented.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(failures.length)} problem(s) found in the generated API reports:`,
      ...failures,
    ].join("\n"),
  }
}

// Keeps docs/api-report/*.api.md (the generated, first-class human-readable API reference -- see
// README's link to it) honest against the package's real public surface and free of undocumented
// symbols. Deliberately mechanical: this never checks that a symbol's documented shape/behavior is
// correct, only that the committed report matches what API Extractor would produce right now, and
// that every symbol in it carries real TSDoc -- the same "presence, not correctness" scope the
// `docs` check already applies to markdown structure/links.
//
// `isolated: true` (see specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md)
// is pure scheduling, not a data dependency: this check's own `generateApiReports`
// (report-targets.ts) runs API Extractor twice against the same real, on-disk
// dist/.dts/index.d.ts/dist/.dts/presets/index.d.ts -- and test/unit/api-docs/check.test.ts,
// running inside `test-unit`, calls that identical function against those identical files, per
// test case, at the same time. Two independent processes analyzing the same declaration files
// concurrently is a real, observed flake (API Extractor's own SourceMapper intermittently
// reporting a real, on-disk .d.ts path as "not found" under that contention -- confirmed by
// rerunning both in isolation immediately afterward, which passed cleanly every time), not a logic
// bug in either. No other check's own test files touch these same paths concurrently with this
// one, so isolating this check alone (rather than also `api-contract`, which uses the same API
// Extractor machinery but against different, non-colliding inputs) is sufficient. Safe to combine
// with `mutation`'s own `isolated: true` (repo-contract.config.ts): both stay exclusive from every
// non-isolated check, and -- like any two isolated checks in the same run -- are always sequential
// relative to each other (an isolated check is a full barrier at its own declared position, so it
// waits on every earlier check, isolated or not; see
// specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md), never concurrent
// with one another.
export const apiDocs: CheckDefinitionConfig = {
  run: ["tsx", "scripts/api-docs/check.ts"],
  isolated: true,
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<ApiDocsEvidence>(
      result.output,
      "api-docs check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateApiDocsPolicy({ evidence: parsed.value })
  },
}
