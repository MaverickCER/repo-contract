import path from "node:path"
import {
  evaluateExceptionRecord,
  loadExceptionRegistry,
  validateExceptionPolicyConfig,
} from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  CoderabbitEvidence,
  NormalizedFinding,
} from "../scripts/coderabbitai/evidence-types.js"
import {
  CODERABBIT_GLOBAL_DEFAULT_POLICY,
  VALID_CODERABBIT_REQUIREMENTS,
  VERIFICATION_FIELD,
  coderabbitPolicy,
} from "../scripts/coderabbitai/policy-config.js"
import type { CoderabbitExceptionRecord } from "../scripts/coderabbitai/registry.js"
import { validateCoderabbitExceptionRegistry } from "../scripts/coderabbitai/registry.js"
import { isVerified } from "../scripts/shared/exception-record.js"
import {
  evaluateExceptionFindings,
  stageMissingFields,
} from "./shared/evaluate-exception-findings.js"
import { handWrittenArraySchema } from "./shared/standard-schema-validator.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

const PROSE_REQUIREMENTS = VALID_CODERABBIT_REQUIREMENTS.filter(
  (field) => field !== VERIFICATION_FIELD,
)

const DEFAULT_EXCEPTIONS_PATH = path.join(".repo-contract", "exceptions", "coderabbit.json")

type LoadRegistryResult =
  | { readonly ok: true; readonly records: readonly CoderabbitExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] }

/**
 * Resolves one named field's current value on a `CoderabbitExceptionRecord` -- the three ordinary
 * prose/enum fields read directly; `"verification.verifiedBy"` delegates to `isVerified`
 * (`scripts/shared/exception-record.ts`), returning the verifier's own name only when the record's
 * `verification` block is present *and* still content-bound to the record's current prose.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value, or `""` if empty/absent/unverified.
 */
function coderabbitFieldValue(record: CoderabbitExceptionRecord, requirement: string): string {
  if (requirement === VERIFICATION_FIELD) {
    return isVerified(record, PROSE_REQUIREMENTS, coderabbitFieldValue)
      ? (record.verification?.verifiedBy ?? "")
      : ""
  }
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Finds the (at most one) registry record backing `finding` -- by exact `id` match, the same
 * `` `${file}:${severity}` `` identity both `NormalizedFinding` and `CoderabbitExceptionRecord`
 * share.
 * @param finding - The finding to find a backing record for.
 * @param records - This run's loaded exception registry.
 * @returns The matching record, or `undefined` if none backs this finding.
 */
function matchFindingToRecord(
  finding: NormalizedFinding,
  records: readonly CoderabbitExceptionRecord[],
): CoderabbitExceptionRecord | undefined {
  return records.find((record) => record.id === finding.identity)
}

/**
 * Evaluates one already-matched `(finding, record)` pair against `coderabbitPolicy` -- classified
 * purely on the finding's own normalized `severity`.
 * @param finding - The finding being evaluated.
 * @param record - The registry record `matchFindingToRecord` found for `finding`.
 * @returns The record's resolved verdict and any still-missing required fields.
 */
function evaluateFinding(
  finding: NormalizedFinding,
  record: CoderabbitExceptionRecord,
): ReturnType<typeof evaluateExceptionRecord<CoderabbitExceptionRecord>> {
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "coderabbit", category: finding.severity },
  ]
  return evaluateExceptionRecord({
    record,
    classifications,
    config: coderabbitPolicy,
    globalDefault: CODERABBIT_GLOBAL_DEFAULT_POLICY,
    fieldValue: coderabbitFieldValue,
  })
}

/**
 * The real `.repo-contract/exceptions/coderabbit.json` loader -- `evaluateCoderabbitPolicy`'s own
 * default `loadRegistry`, overridable in tests so they never touch the filesystem.
 * @param exceptionsPath - Path to the exceptions registry file.
 * @returns The loaded registry records, or the errors found validating it.
 */
async function defaultLoadRegistry(exceptionsPath: string): Promise<LoadRegistryResult> {
  const result = await loadExceptionRegistry<CoderabbitExceptionRecord>({
    path: exceptionsPath,
    schema: handWrittenArraySchema(validateCoderabbitExceptionRegistry),
  })
  return result.ok ? { ok: true, records: result.records } : { ok: false, errors: result.errors }
}

interface EvaluateCoderabbitPolicyInput {
  readonly evidence: CoderabbitEvidence
  readonly exceptionsPath?: string
  /** Overridable for tests -- defaults to reading the real `.repo-contract/exceptions/coderabbit.json`. */
  readonly loadRegistry?: (exceptionsPath: string) => Promise<LoadRegistryResult>
}

/**
 * Evaluates the `coderabbitai` check's own emitted evidence. `not-applicable`/`unavailable` is a
 * `warn`, never a `fail` or a silent `pass` -- CI, where review is delegated to the CodeRabbit
 * GitHub App, is the expected steady state for this outcome, but it must still be visibly recorded
 * on every single run (per the user's own explicit direction: a local skip must surface the exact
 * same warning CI always shows, so one is never mistaken for the other). `error` (a malformed
 * event stream, or a real CLI-reported failure) fails closed. A clean review (no findings) or every
 * finding permitted passes; any `forbidden`/`insufficient` verdict or unmatched finding fails,
 * listed individually.
 * @param input - The evidence to evaluate, and (for tests) the exceptions-registry path/loader to use.
 * @returns The check's `PolicyResult`.
 */
export async function evaluateCoderabbitPolicy(
  input: EvaluateCoderabbitPolicyInput,
): Promise<PolicyResult> {
  const {
    evidence,
    exceptionsPath = DEFAULT_EXCEPTIONS_PATH,
    loadRegistry = defaultLoadRegistry,
  } = input

  // Config + registry validation run FIRST -- before every evidence-status branch, including the
  // `not-applicable`/`unavailable` ones that don't evaluate any findings. In CI `status` is
  // always `not-applicable` (review is delegated to the GitHub App), so validating the registry
  // only on a real local `reviewed` run would mean a malformed or unparseable
  // `.repo-contract/exceptions/coderabbit.json` never fails CI at all -- exactly the "a stale or
  // broken registry silently rides along with a green run" gap this feature exists to close.
  const configErrors = validateExceptionPolicyConfig(
    coderabbitPolicy,
    VALID_CODERABBIT_REQUIREMENTS,
  )
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: ["coderabbitPolicy is misconfigured:", ...configErrors.map((e) => `- ${e}`)].join(
        "\n",
      ),
    }
  }

  const registry = await loadRegistry(exceptionsPath)
  if (!registry.ok) {
    return {
      outcome: "fail",
      rationale: [
        `${exceptionsPath} failed validation:`,
        ...registry.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  /** Records present but not compared against any finding this run (no review ran). */
  const unevaluatedNote =
    registry.records.length > 0
      ? ` ${String(registry.records.length)} exception record(s) in ${exceptionsPath} were not evaluated (no review ran this run).`
      : ""

  if (evidence.status === "not-applicable") {
    return {
      outcome: "warn",
      rationale: `coderabbitai did not run (${evidence.reason}) -- findings were not evaluated. Expected in CI, where review is delegated to the ${evidence.expectedProvider}.${unevaluatedNote}`,
    }
  }

  if (evidence.status === "unavailable") {
    return {
      outcome: "warn",
      rationale: `coderabbitai did not run (${evidence.reason}) -- findings were not evaluated. Install the CodeRabbit CLI (https://docs.coderabbit.ai/cli) and run from a real branch to enable real enforcement.${unevaluatedNote}`,
    }
  }

  if (evidence.status === "error") {
    return { outcome: "fail", rationale: `coderabbitai review failed: ${evidence.message}` }
  }

  if (evidence.findings.length === 0) {
    const staleNote =
      registry.records.length > 0
        ? ` ${String(registry.records.length)} exception record(s) matched nothing this run: ${registry.records.map((r) => r.id).join(", ")}.`
        : ""
    return {
      outcome: "pass",
      rationale: `coderabbit review --agent reported 0 findings.${staleNote}`,
    }
  }

  const { matched, unmatchedFindings, staleExceptions, summary } = evaluateExceptionFindings({
    items: evidence.findings,
    records: registry.records,
    matchRecord: matchFindingToRecord,
    evaluate: evaluateFinding,
  })

  const offenders = matched.filter(({ determinant }) => determinant.verdict !== "permitted")

  if (offenders.length === 0 && unmatchedFindings.length === 0) {
    const staleNote =
      staleExceptions.length > 0
        ? ` ${String(staleExceptions.length)} exception record(s) matched nothing this run: ${staleExceptions.map((r) => r.id).join(", ")}.`
        : ""
    return { outcome: "pass", rationale: `${summary}${staleNote}` }
  }

  const offenderLines = offenders.map(({ item, determinant }) => {
    const staged = stageMissingFields(determinant.missing, VERIFICATION_FIELD)
    const detail =
      determinant.verdict === "forbidden"
        ? "forbidden by policy"
        : `insufficient (missing: ${staged.join(", ")})`
    return `- ${item.file} [${item.severity}]: ${detail} -- ${item.summary}`
  })

  const unmatchedLines = unmatchedFindings.map(
    (finding) =>
      `- ${finding.file} [${finding.severity}]: no matching exception record -- ${finding.summary}`,
  )

  return {
    outcome: "fail",
    rationale: [summary, ...offenderLines, ...unmatchedLines].join("\n"),
  }
}

// Promotes CONTRIBUTING.md/.githooks/pre-push's former local-only `coderabbit review --agent`
// shell step into a real, always-declared check -- see specs/decisions/0014-coderabbit-as-a-
// surfaced-check.md for why: this check's own non-execution (in CI, or locally when the CLI isn't
// installed) is itself recorded and surfaced as a warn on every single run, which is what makes
// including it safe (a local skip for any reason looks identical to, and is exactly as visible as,
// the expected CI state).
export const coderabbitai: CheckDefinitionConfig = {
  run: ["tsx", "scripts/coderabbitai/review.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<CoderabbitEvidence>(
      result.output,
      "coderabbitai check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateCoderabbitPolicy({ evidence: parsed.value })
  },
}
