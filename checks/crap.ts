import { AGGREGATE_COVERAGE_FINAL_PATH } from "../scripts/aggregate-coverage-paths.mjs"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

export interface CrapFunction {
  readonly file: string
  readonly name: string
  readonly startLine: number
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
const CRAP_THRESHOLD = 30

/**
 * The CRAP check's full interpretation logic, factored out so test/unit/crap/policy.test.ts can
 * exercise the threshold comparison directly against an already-parsed report, without spawning
 * crap4ts -- matching every other check's own `evaluate<Name>Policy` convention (see e.g.
 * checks/adr-governance.ts).
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

  // A function row whose `crap` isn't a finite number (crap4ts emitted
  // `null`, a string, or omitted the field) must fail the check, not be
  // silently excluded from the offender scan -- an unreadable CRAP value is
  // an unevaluated function, exactly the fail-closed stance
  // checks/coverage.ts takes for a non-numeric metric. Filtering it out
  // instead would let a genuinely over-threshold function pass unnoticed.
  const unreadable = functions.filter((fn: CrapFunction) => !Number.isFinite(fn.crap))

  if (unreadable.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `CRAP4TS reported ${String(unreadable.length)} function(s) with no readable CRAP score:`,
        ...unreadable.map(
          (fn) =>
            `- ${fn.file}:${String(fn.startLine)} ${fn.name} — CRAP ${JSON.stringify(fn.crap)}`,
        ),
      ].join("\n"),
    }
  }

  // Compared against this file's own CRAP_THRESHOLD, never report.threshold
  // -- the report only echoes back whatever threshold crap4ts itself was
  // told to use, and trusting that echo instead of the value this repo
  // actually configured would silently detach the gate from --threshold
  // above the moment the two could ever disagree.
  const offenders = functions.filter((fn: CrapFunction) => fn.crap > CRAP_THRESHOLD)

  if (offenders.length === 0) {
    return {
      outcome: "pass",
      rationale: `CRAP4TS reported no function above the threshold of ${String(CRAP_THRESHOLD)} (${String(functions.length)} function(s) analyzed).`,
    }
  }

  const details = offenders
    .sort((a, b) => b.crap - a.crap)
    .map(
      (fn: CrapFunction) =>
        `${fn.file}:${String(fn.startLine)} ${fn.name} — CRAP ${String(fn.crap)} (maximum ${String(CRAP_THRESHOLD)})`,
    )

  return {
    outcome: "fail",
    rationale: [
      `CRAP threshold exceeded by ${String(offenders.length)} function(s):`,
      ...details.map((detail: string) => `- ${detail}`),
    ].join("\n"),
  }
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
