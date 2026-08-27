import { readFile } from "node:fs/promises"
import { readJsonReport } from "../src/presets/shared/read-json-report.js"
import type { SuppressionGovernanceEvidence } from "../scripts/suppression-governance/evidence-types.js"
import { suppressionPolicy } from "../scripts/suppression-governance/policy-config.js"
import { describeRecord, evaluateRecord } from "../scripts/suppression-governance/resolve-policy.js"
import type { CheckDefinitionConfig } from "../src/types.js"

type StrykerMutantStatus =
  "Killed" | "Survived" | "NoCoverage" | "RuntimeError" | "Timeout" | "CompileError" | "Ignored"

// Checked via Set membership rather than chained `!==` comparisons: the
// latter narrows StrykerMutantStatus down to a single remaining literal,
// which `no-unnecessary-condition` then (rightly, by the type) flags as
// always false -- but the type only reflects what the JSON schema promises,
// not what untrusted report JSON actually contains, so the defensive check
// still needs to run at runtime.
const KNOWN_MUTANT_STATUSES: ReadonlySet<StrykerMutantStatus> = new Set([
  "Killed",
  "Survived",
  "NoCoverage",
  "RuntimeError",
  "Timeout",
  "CompileError",
  "Ignored",
])

/**
 * Takes `unknown`, not `StrykerReport["files"]`, for the same reason KNOWN_MUTANT_STATUSES is
 * checked via Set membership rather than a chained `!==`/`===` comparison (see that constant's own
 * comment): narrowing a value already typed as `Record<string, StrykerFileResult>` would make
 * `no-unnecessary-condition` (rightly, by the type) flag this as always true -- but that type only
 * reflects what the JSON schema promises, not what untrusted report JSON actually contains, so the
 * runtime check still needs to run. Widening the parameter to `unknown` here is what lets that
 * check exist at all without fighting the linter.
 * @param value - The value to check.
 * @returns True if `value` is a non-null, non-array plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Stryker's own hardcoded statusReason for a mutant ignored via an inline
// `// Stryker disable` comment (see @stryker-mutator/instrumenter's
// directive-bookkeeper.ts). A comment-ignored mutant is trusted only because
// this check independently cross-checks the same directives against
// suppression-governance's own registry (`disable-comments.json`, read via
// `dependencies["suppression-governance"]` below) -- not merely because this
// repository's require-stryker-rationale ESLint rule already requires *some*
// adjacent reason text at authoring time. That rule still matters (it's what
// guarantees a `reason` exists at all for
// scripts/suppression-governance/recognizers.ts to mechanically capture),
// but the registry cross-check below -- requiring every Stryker-domain
// record to also carry justification/alternatives/remediation -- is what
// this policy actually relies on. See
// specs/decisions/0007-suppression-governance.md. An Ignored
// mutant with any other statusReason (e.g. a config-level
// `mutator.excludedMutations` or `ignoreStatic` exclusion) bypasses both
// gates entirely and is treated as unjustified.
const COMMENT_IGNORE_REASON = "Ignored using a comment"

interface StrykerLocationPosition {
  readonly line: number
  readonly column: number
}

interface StrykerLocation {
  readonly start: StrykerLocationPosition
  readonly end: StrykerLocationPosition
}

interface StrykerMutantResult {
  readonly id: number
  // Optional rather than required: every mutant in practice carries a
  // location, but this describes untrusted tool JSON (see the `as
  // StrykerReport` cast below), not a value this package itself produced --
  // formatMutant's fallback stays meaningful only if the type admits the
  // absence it defends against.
  readonly location?: StrykerLocation
  readonly mutatorName: string
  readonly replacement: string
  readonly status: StrykerMutantStatus
  readonly statusReason?: string
  readonly testsCompleted?: number
  readonly killedBy?: readonly string[]
  readonly coveredBy?: readonly string[]
}

interface StrykerFileResult {
  readonly language: string
  readonly source: string
  readonly mutants: readonly StrykerMutantResult[]
}

interface StrykerReport {
  readonly schemaVersion: string
  readonly files: Record<string, StrykerFileResult>
  readonly testFiles?: Record<string, unknown>
  readonly thresholds?: {
    readonly high?: number
    readonly low?: number
    readonly break?: number
  }
  readonly projectRoot?: string
  readonly config?: Record<string, unknown>
  readonly framework?: Record<string, unknown>
}

// Stryker's JSON reporter (configured via stryker.config.mjs's
// jsonReporter.fileName) writes the report to disk -- it never prints JSON
// to stdout, which instead carries Stryker's own colored progress log. The
// report is therefore read from disk directly, matching the
// security-secrets check's own file-based pattern.
//
// This check combines two independent, deliberately-separated mechanisms.
// `isolated: true` below is pure scheduling: Stryker spawns its own
// concurrent worker processes internally, and running it alongside this
// repository's own full concurrent test suite starves timing margins
// elsewhere under heavy load -- a real, observed flake in
// run-checks.test.ts's SIGINT-cleanup test, caused by resource contention
// rather than a logic bug. Letting `mutation` run last, only once every
// non-isolated check has settled, removes that contention; it says nothing
// about needing any other check's evidence (see
// specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md
// -- a second isolated check, e.g. `api-docs`, is free to run concurrently
// with this one; only non-isolated checks are guaranteed to have already
// finished -- against another isolated check, e.g. `api-docs`, the guarantee is actually stronger:
// an isolated check is a full barrier at its own declared position, waiting on every earlier check
// including other isolated ones, so two isolated checks in the same run are always sequential
// relative to each other, never concurrent). Separately,
// repo-contract.config.ts's `dependsOn: ["suppression-governance"]` *is* a
// genuine evidence dependency: this policy actually reads that check's
// evidence (`dependencies["suppression-governance"]` below) to verify every
// Stryker-domain suppression in the registry before trusting any
// comment-ignored mutant (see
// specs/decisions/0007-suppression-governance.md).
export const mutation: CheckDefinitionConfig = {
  run: ["node", "scripts/run-mutation.mjs"],
  isolated: true,
  policy: async ({ dependencies }) => {
    const parsed = await readJsonReport<StrykerReport>(
      () => readFile("reports/mutation/mutation.json", "utf8"),
      "Stryker did not produce its expected JSON report.",
      "Stryker produced invalid JSON evidence.",
    )
    if (!parsed.ok) return parsed.result
    const report = parsed.value

    // `report` is only cast, not validated, from untrusted tool JSON (same caveat as
    // KNOWN_MUTANT_STATUSES's own comment above) -- `report.files` specifically is checked here,
    // not just trusted via the type, because `Object.entries` on anything other than a plain
    // object (missing entirely, `null`, an array, or some other JSON shape from a Stryker reporter
    // change or a truncated write) throws a raw TypeError instead of the clean fail-rationale this
    // check already gives the JSON-parse failure above.
    if (!isPlainObject(report.files)) {
      return {
        outcome: "fail",
        rationale: 'Stryker\'s JSON report is missing a valid "files" object.',
      }
    }

    // Each per-file entry is likewise untrusted: a truncated write or a
    // reporter-format change can make one `null` or an object without a
    // `mutants` array, and `data.mutants.map` would then throw out of the
    // policy instead of returning the clean fail this check produces for the
    // sibling malformed-`files` case just above.
    const malformedFile = Object.entries(report.files).find(
      ([, data]) => !isPlainObject(data) || !Array.isArray(data.mutants),
    )

    if (malformedFile) {
      return {
        outcome: "fail",
        rationale: `Stryker's JSON report has a malformed entry for "${malformedFile[0]}" (no "mutants" array).`,
      }
    }

    const mutants = Object.entries(report.files).flatMap(([file, data]) =>
      data.mutants.map((mutant: StrykerMutantResult) => ({
        file,
        mutant,
      })),
    )

    if (mutants.length === 0) {
      return {
        outcome: "fail",
        rationale:
          "Stryker produced no mutants. Mutation evidence cannot establish test effectiveness.",
      }
    }

    // Grouped in a single pass rather than one `.filter` traversal of
    // `mutants` per status: a Stryker report can carry many thousands of
    // mutants, and every bucket below is derivable from one walk.
    const byStatus = new Map<
      string,
      { readonly file: string; readonly mutant: StrykerMutantResult }[]
    >()
    for (const entry of mutants) {
      const bucket = byStatus.get(entry.mutant.status) ?? []
      bucket.push(entry)
      byStatus.set(entry.mutant.status, bucket)
    }
    const group = (
      status: StrykerMutantStatus,
    ): readonly { readonly file: string; readonly mutant: StrykerMutantResult }[] =>
      byStatus.get(status) ?? []

    const killed = group("Killed")

    const survived = group("Survived")

    const noCoverage = group("NoCoverage")

    const timedOut = group("Timeout")

    const runtimeErrors = group("RuntimeError")

    // "CompileError" is Stryker's own status name; it covers build failures
    // of the mutated code too, so there is no separate "build error" status
    // to track alongside it.
    const compileErrors = group("CompileError")

    const ignored = group("Ignored")

    const justifiedIgnored = ignored.filter(
      ({ mutant }) => mutant.statusReason === COMMENT_IGNORE_REASON,
    )

    const unjustifiedIgnored = ignored.filter(
      ({ mutant }) => mutant.statusReason !== COMMENT_IGNORE_REASON,
    )

    const unknown = mutants.filter(({ mutant }) => !KNOWN_MUTANT_STATUSES.has(mutant.status))

    // Only relevant when at least one mutant is trusted purely on the
    // strength of a `// Stryker disable` comment -- nothing to verify
    // otherwise. Matching is deliberately a *global* gate over every
    // Stryker-domain registry record, not a per-mutant lookup: Stryker's own
    // report exposes no back-reference from a mutant to the specific
    // disable-comment that ignored it, and a single block-form directive
    // (`// Stryker disable BlockStatement,CallExpression`) can cover many
    // subsequent lines/mutants until a matching `Stryker restore`, while
    // `disable-comments.json` only records the directive's own line -- so
    // there is no reliable line-based way to attribute one mutant to one
    // record. See specs/decisions/0007-suppression-governance.md.
    const strykerSuppressionGateFailure:
      { header: string; details: readonly string[] } | undefined =
      justifiedIgnored.length === 0
        ? undefined
        : ((): { header: string; details: readonly string[] } | undefined => {
            const suppressionEvidence = dependencies["suppression-governance"]
            const parsedOutput =
              suppressionEvidence?.output?.success === true
                ? suppressionEvidence.output.value
                : undefined

            if (parsedOutput === undefined) {
              return {
                header:
                  "Stryker suppression registry unverifiable: suppression-governance produced no usable evidence.",
                details: [],
              }
            }

            const evidence = parsedOutput as SuppressionGovernanceEvidence

            if (!evidence.ok) {
              return {
                header: `Stryker suppression registry unverifiable: ${evidence.error}`,
                details: [],
              }
            }

            const insufficient = evidence.records
              .filter((record) => record.domain === "stryker")
              .map((record) => evaluateRecord(record, suppressionPolicy))
              .filter((determinant) => determinant.verdict !== "permitted")

            if (insufficient.length === 0) return undefined

            return {
              header: `Under-justified Stryker suppressions (${String(insufficient.length)}):`,
              details: insufficient.map((determinant) => `- ${describeRecord(determinant.record)}`),
            }
          })()

    const detected = killed.length + runtimeErrors.length + compileErrors.length
    const applicableMutants = mutants.length - justifiedIgnored.length

    const score = applicableMutants === 0 ? 100 : (detected / applicableMutants) * 100 // Killed, RuntimeError, and CompileError are all accepted: a mutant a
    // test suite could not even execute cleanly is not evidence of a test
    // gap the way a Survived mutant is. Timeout, NoCoverage, Survived, and
    // unjustified Ignored mutants each fail the check outright, and so does
    // any status this policy doesn't recognize. A comment-ignored mutant is
    // accepted only once the Stryker suppression gate above finds nothing to
    // object to.
    const passed =
      survived.length === 0 &&
      noCoverage.length === 0 &&
      timedOut.length === 0 &&
      unjustifiedIgnored.length === 0 &&
      unknown.length === 0 &&
      strykerSuppressionGateFailure === undefined

    const formatMutant = ({
      file,
      mutant,
    }: {
      readonly file: string
      readonly mutant: StrykerMutantResult
    }): string => {
      const location = mutant.location
        ? `${file}:${String(mutant.location.start.line)}:${String(mutant.location.start.column)}`
        : file

      return `${location} — ${mutant.mutatorName}: ${mutant.replacement}`
    }

    const passingBreakdown = [
      `${String(killed.length)} Killed`,
      `${String(justifiedIgnored.length)} Ignored (accepted)`,
      `${String(runtimeErrors.length)} Runtime errors`,
      `${String(compileErrors.length)} Compile errors`,
    ].join(", ")

    const failingBreakdown = [
      `${String(survived.length)} Survived`,
      `${String(noCoverage.length)} No coverage`,
      `${String(timedOut.length)} Timed out`,
      `${String(unjustifiedIgnored.length)} Unjustified ignored`,
      `${String(unknown.length)} Unknown`,
    ].join(", ")

    const sections: string[] = [
      `Detected mutation score: ${score.toFixed(2)}% (${String(mutants.length)} Total).`,
      `Passing (${passingBreakdown}).`,
      `Failing (${failingBreakdown}).`,
    ]

    if (survived.length > 0) {
      sections.push(
        `Survived (${String(survived.length)}):`,
        ...survived.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (noCoverage.length > 0) {
      sections.push(
        `No coverage (${String(noCoverage.length)}):`,
        ...noCoverage.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (timedOut.length > 0) {
      sections.push(
        `Timed out (${String(timedOut.length)}):`,
        ...timedOut.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (unjustifiedIgnored.length > 0) {
      sections.push(
        `Unjustified ignores (${String(unjustifiedIgnored.length)}):`,
        ...unjustifiedIgnored.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (strykerSuppressionGateFailure !== undefined) {
      sections.push(strykerSuppressionGateFailure.header, ...strykerSuppressionGateFailure.details)
    }

    if (runtimeErrors.length > 0) {
      sections.push(
        `Runtime errors (${String(runtimeErrors.length)}, accepted):`,
        ...runtimeErrors.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (compileErrors.length > 0) {
      sections.push(
        `Compile errors (${String(compileErrors.length)}, accepted):`,
        ...compileErrors.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (unknown.length > 0) {
      sections.push(
        `Unexpected statuses (${String(unknown.length)}):`,
        ...unknown.map(({ file, mutant }) => `- ${formatMutant({ file, mutant })}`),
      )
    }

    if (!passed) {
      sections.push(
        `Policy: failed. The repository requires zero Survived, NoCoverage, Timeout, and unjustified Ignored mutants (Killed, RuntimeError, CompileError, and comment-ignored mutants are accepted); a comment-ignored mutant is accepted only once every Stryker-domain suppression in the registry is fully justified.`,
      )
      return { outcome: "fail", rationale: sections.join("\n") }
    }

    sections.push(
      `Policy: passed. The repository requires zero Survived, NoCoverage, Timeout, and unjustified Ignored mutants (Killed, RuntimeError, CompileError, and comment-ignored mutants are accepted); a comment-ignored mutant is accepted only once every Stryker-domain suppression in the registry is fully justified.`,
    )
    return { outcome: "pass", rationale: sections.join("\n") }
  },
}
