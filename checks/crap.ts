import { readFile } from "node:fs/promises"
import { AGGREGATE_COVERAGE_FINAL_PATH } from "../scripts/aggregate-coverage-paths.mjs"
import { readJsonReport } from "../src/presets/shared/read-json-report.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

export interface CrapFunction {
  readonly file: string
  readonly name: string
  readonly startLine: number
  readonly complexity: number
  readonly crap: number
}

export interface CrapReport {
  readonly threshold: number
  readonly functions: readonly CrapFunction[]
}

// The one place the required CRAP threshold lives. It is pinned and passed
// to crap4ts via --threshold below. SIZE_BUDGETS in checks/size.ts follows the
// same rule: this repo owns the number, never the tool's default. Without
// --threshold, crap4ts falls back to a hardcoded default (30 in
// @danibram/crap4ts's current release). This repository does not control that
// default and would not see it change across a dependency bump.
export const CRAP_THRESHOLD = 30

// An independent ceiling on each function's raw cyclomatic complexity,
// enforced by this policy alongside the CRAP threshold above. CRAP is
// `complexity^2 * (1 - coverage)^3 + complexity`, which collapses to plain
// `complexity` as coverage approaches 100%. This repository's coverage floor
// is already that high (see scripts/coverage-thresholds.mjs), so CRAP alone
// stops constraining a fully-covered but deeply-branchy function.
// A function at cyclomatic 30, fully covered, scores CRAP 30 and passes the
// CRAP gate with no downward pressure. ESLint's default `complexity` limit is
// 20. The crap4ts CLI has no raw-complexity fail flag, so this policy enforces it.
// The policy owns the number, as it owns CRAP_THRESHOLD over report.threshold.
export const MAX_COMPLEXITY = 20

/**
 * The CRAP check's full interpretation logic, factored out for unit testing.
 * test/unit/crap/policy.test.ts exercises the threshold and complexity-ceiling comparisons on a
 * parsed report, without spawning crap4ts. This matches every other check's
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - crap4ts's parsed JSON report.
 * @returns the pass/fail verdict.
 */
export function evaluateCrapPolicy({ evidence }: { readonly evidence: CrapReport }): PolicyResult {
  if (!Array.isArray(evidence.functions)) {
    return { outcome: "fail", rationale: "CRAP4TS produced invalid JSON report data." }
  }

  // `Array.isArray` narrows its argument to `any[]` whatever the checked
  // value's declared type (a long-standing TypeScript limitation). This
  // annotation keeps the `CrapFunction` element type for the scans below.
  const functions: readonly CrapFunction[] = evidence.functions

  // A function row whose `crap` or `complexity` isn't a finite number fails
  // the check. crap4ts may emit `null` or a string, or omit the field. An
  // unreadable metric is an unevaluated function, so excluding it from the
  // offender scans below could let an over-threshold function pass unnoticed.
  // The coverage check fails closed on a non-numeric metric the same way.
  const unreadable = functions.filter(
    (fn: CrapFunction) => !Number.isFinite(fn.crap) || !Number.isFinite(fn.complexity),
  )

  if (unreadable.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `CRAP4TS reported ${String(unreadable.length)} function(s) with an unreadable CRAP or complexity score:`,
        ...unreadable.map(
          (fn) =>
            `- ${fn.file}:${String(fn.startLine)} ${fn.name}: CRAP ${JSON.stringify(fn.crap)}, complexity ${JSON.stringify(fn.complexity)}`,
        ),
      ].join("\n"),
    }
  }

  // Both scans run independently, and both sections are reported when both
  // have offenders (a function can trip one, the other, or both). This is
  // the same "keep the two tools' findings as separate sections" shape
  // checks/lint.ts uses for ESLint vs oxlint.
  //
  // Compared against this file's CRAP_THRESHOLD, never report.threshold.
  // The report only echoes back whatever threshold crap4ts was told to use.
  // Trusting that echo over the value this repo configured would silently
  // detach the gate from --threshold above the moment the two disagree.
  const crapOffenders = functions
    .filter((fn: CrapFunction) => fn.crap > CRAP_THRESHOLD)
    .sort((a, b) => b.crap - a.crap)

  // The independent raw-complexity ceiling: see MAX_COMPLEXITY's note
  // above for why CRAP alone no longer covers this.
  const complexityOffenders = functions
    .filter((fn: CrapFunction) => fn.complexity > MAX_COMPLEXITY)
    .sort((a, b) => b.complexity - a.complexity)

  if (crapOffenders.length === 0 && complexityOffenders.length === 0) {
    return {
      outcome: "pass",
      rationale: `CRAP4TS reported no function above the CRAP threshold of ${String(CRAP_THRESHOLD)} or the complexity ceiling of ${String(MAX_COMPLEXITY)} (${String(functions.length)} function(s) analyzed).`,
    }
  }

  const sections: string[] = []

  if (crapOffenders.length > 0) {
    sections.push(
      `CRAP threshold exceeded by ${String(crapOffenders.length)} function(s):`,
      ...crapOffenders.map(
        (fn: CrapFunction) =>
          `- ${fn.file}:${String(fn.startLine)} ${fn.name}: CRAP ${String(fn.crap)} (maximum ${String(CRAP_THRESHOLD)})`,
      ),
    )
  }

  if (complexityOffenders.length > 0) {
    sections.push(
      `Complexity ceiling exceeded by ${String(complexityOffenders.length)} function(s):`,
      ...complexityOffenders.map(
        (fn: CrapFunction) =>
          `- ${fn.file}:${String(fn.startLine)} ${fn.name}: complexity ${String(fn.complexity)} (maximum ${String(MAX_COMPLEXITY)})`,
      ),
    )
  }

  return { outcome: "fail", rationale: sections.join("\n") }
}

// Reads the aggregate coverage artifact the `coverage` check's policy just
// evaluated (scripts/aggregate-coverage.mjs), never a separate coverage map.
// For that reason repo-contract.config.ts's `dependsOn` for this check names
// `coverage`, not the three test-* checks it aggregates.
// The report goes to a file (`--output`), never stdout. crap4ts exits right after writing. A piped
// stdout is cut at the OS pipe buffer (64 KiB) when the process exits before the reader drains it.
// This repository's JSON report is larger than that and would arrive truncated ("... at position
// 65536"). A file has no such limit. It lives under coverage/aggregate/, which the `coverage`
// check has already created. The crap4ts CLI does not create missing parent directories, and a
// fresh CI checkout has no reports/ directory.
const CRAP_REPORT_PATH = "coverage/aggregate/crap4ts-report.json"

export const crap: CheckDefinitionConfig = {
  run: [
    "crap4ts",
    "src",
    "--coverage",
    AGGREGATE_COVERAGE_FINAL_PATH,
    "--threshold",
    String(CRAP_THRESHOLD),
    "--reporter",
    "json",
    "--output",
    CRAP_REPORT_PATH,
  ],
  policy: async ({ result }) => {
    if (result.status !== "completed") {
      return {
        outcome: "fail",
        rationale: `CRAP4TS did not run to completion (status: ${result.status}).`,
      }
    }

    const parsed = await readJsonReport<CrapReport>(
      () => readFile("coverage/aggregate/crap4ts-report.json", "utf8"),
      "CRAP4TS did not produce its expected JSON report.",
      "CRAP4TS output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateCrapPolicy({ evidence: parsed.value })
  },
}
