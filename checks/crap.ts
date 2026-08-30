import { AGGREGATE_COVERAGE_FINAL_PATH } from "../scripts/aggregate-coverage-paths.mjs"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
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

// The one place the required CRAP threshold lives -- explicitly pinned and
// passed to crap4ts via --threshold below, the same "this repo owns the
// number, never the tool's own default" convention as SIZE_BUDGETS in
// checks/size.ts. Without an explicit --threshold, crap4ts falls back to its
// own hardcoded default (30 as of @danibram/crap4ts's current release), which
// this repository has no control over and no visibility into if it ever
// changes across a dependency bump.
export const CRAP_THRESHOLD = 30

// An independent ceiling on each function's raw cyclomatic complexity,
// enforced by this policy alongside the CRAP threshold above. It exists
// because CRAP is `complexity^2 * (1 - coverage)^3 + complexity`, which
// collapses to plain `complexity` as coverage approaches 100% -- and this
// repository's coverage floor is already high enough (see
// scripts/coverage-thresholds.mjs) that CRAP alone stops meaningfully
// constraining a fully-covered but deeply-branchy function: `tokenizeRunString`
// sat at cyclomatic 30 / 100% covered / CRAP 30, passing the CRAP gate with
// zero downward pressure. 20 is ESLint's own default `complexity` limit.
// crap4ts is not asked to enforce this (it has no raw-complexity fail flag) --
// the policy owns the number, the same "this repo owns the number, never the
// tool's echo" stance it already takes for CRAP_THRESHOLD vs report.threshold.
export const MAX_COMPLEXITY = 20

/**
 * The CRAP check's full interpretation logic, factored out so test/unit/crap/policy.test.ts can
 * exercise the CRAP-threshold and complexity-ceiling comparisons directly against an
 * already-parsed report, without spawning crap4ts -- matching every other check's own
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - crap4ts's own parsed JSON report.
 * @returns the pass/fail verdict.
 */
export function evaluateCrapPolicy({ evidence }: { readonly evidence: CrapReport }): PolicyResult {
  if (!Array.isArray(evidence.functions)) {
    return { outcome: "fail", rationale: "CRAP4TS produced invalid JSON report data." }
  }

  // Re-annotated rather than used directly: `Array.isArray` narrows its
  // argument to `any[]` regardless of the checked value's declared type
  // (a long-standing TypeScript limitation), so `evidence.functions` would
  // otherwise silently lose its `CrapFunction` element type below.
  const functions: readonly CrapFunction[] = evidence.functions

  // A function row whose `crap` or `complexity` isn't a finite number
  // (crap4ts emitted `null`, a string, or omitted the field) must fail the
  // check, not be silently excluded from the offender scans below -- an
  // unreadable metric is an unevaluated function, exactly the fail-closed
  // stance checks/coverage.ts takes for a non-numeric metric. Filtering it
  // out instead would let a genuinely over-threshold function pass unnoticed.
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
            `- ${fn.file}:${String(fn.startLine)} ${fn.name} — CRAP ${JSON.stringify(fn.crap)}, complexity ${JSON.stringify(fn.complexity)}`,
        ),
      ].join("\n"),
    }
  }

  // Both scans run independently and both sections are reported when both
  // have offenders (a function can trip one, the other, or both) -- the same
  // "keep the two tools' findings as separate sections" shape checks/lint.ts
  // uses for ESLint vs oxlint.
  //
  // Compared against this file's own CRAP_THRESHOLD, never report.threshold
  // -- the report only echoes back whatever threshold crap4ts itself was
  // told to use, and trusting that echo instead of the value this repo
  // actually configured would silently detach the gate from --threshold
  // above the moment the two could ever disagree.
  const crapOffenders = functions
    .filter((fn: CrapFunction) => fn.crap > CRAP_THRESHOLD)
    .sort((a, b) => b.crap - a.crap)

  // The independent raw-complexity ceiling -- see MAX_COMPLEXITY's own note
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
          `- ${fn.file}:${String(fn.startLine)} ${fn.name} — CRAP ${String(fn.crap)} (maximum ${String(CRAP_THRESHOLD)})`,
      ),
    )
  }

  if (complexityOffenders.length > 0) {
    sections.push(
      `Complexity ceiling exceeded by ${String(complexityOffenders.length)} function(s):`,
      ...complexityOffenders.map(
        (fn: CrapFunction) =>
          `- ${fn.file}:${String(fn.startLine)} ${fn.name} — complexity ${String(fn.complexity)} (maximum ${String(MAX_COMPLEXITY)})`,
      ),
    )
  }

  return { outcome: "fail", rationale: sections.join("\n") }
}

// Reads the same canonical aggregate coverage artifact the `coverage`
// check's own policy just evaluated (see scripts/aggregate-coverage.mjs) --
// never a separately-computed coverage map -- so repo-contract.config.ts's
// `dependsOn` on this check names `coverage` directly rather than the three
// test-* checks it aggregates.
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
  ],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<CrapReport>(
      result.output,
      "CRAP4TS output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateCrapPolicy({ evidence: parsed.value })
  },
}
