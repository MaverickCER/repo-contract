import { evaluateExceptionRecord, validateExceptionPolicyConfig } from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  CoderabbitEvidence,
  CoderabbitExceptionRecord,
  NormalizedFinding,
} from "../scripts/coderabbitai/evidence-types.js"
import {
  CODERABBIT_GLOBAL_DEFAULT_POLICY,
  VALID_CODERABBIT_REQUIREMENTS,
  coderabbitPolicy,
} from "../scripts/coderabbitai/policy-config.js"
import { CODERABBIT_EXCEPTION_SCHEMA } from "../scripts/coderabbitai/registry.js"
import { validateExceptionRegistry } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Reads one required field's current string value straight off a reconciled record.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
function coderabbitFieldValue(record: CoderabbitExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Evaluates one finding against `coderabbitPolicy`, classified purely on its `severity`.
 * @param finding - The finding.
 * @param record - The reconciled live record for it, or `undefined` if the bijection broke.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateFinding(
  finding: NormalizedFinding,
  record: CoderabbitExceptionRecord | undefined,
): {
  readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"
  readonly missing: readonly string[]
} {
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "coderabbit", category: finding.severity },
  ]
  const determinant = evaluateExceptionRecord({
    record,
    classifications,
    config: coderabbitPolicy,
    globalDefault: CODERABBIT_GLOBAL_DEFAULT_POLICY,
    fieldValue: coderabbitFieldValue,
  })
  return { verdict: determinant.verdict, missing: determinant.missing }
}

/**
 * Evaluates the `coderabbitai` check's own emitted evidence -- a pure evidence->verdict function.
 * `not-applicable` (CI, review delegated to the GitHub App) / `unavailable` is a `warn`, always
 * visibly recorded. `error` fails closed. A malformed/unreconcilable registry (`registryError`)
 * fails regardless of status. A `reviewed` run: any `forbidden` / `insufficient` / `unmatched`
 * verdict or stale record fails, listed individually.
 * @param input - Wraps the evidence to evaluate.
 * @param input.evidence - The `CoderabbitEvidence` emitted by review.ts.
 * @returns The check's `PolicyResult`.
 */
export function evaluateCoderabbitPolicy(input: {
  readonly evidence: CoderabbitEvidence
}): PolicyResult {
  const { evidence } = input

  if (evidence.registryError !== undefined) {
    return {
      outcome: "fail",
      rationale: [
        `${evidence.registryPath} failed to load or reconcile and was left unchanged:`,
        ...evidence.registryError.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

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

  if (evidence.status === "not-applicable") {
    const note =
      evidence.existingRecordCount > 0
        ? ` ${String(evidence.existingRecordCount)} exception record(s) in ${evidence.registryPath} were validated but not reconciled (no review ran).`
        : ""
    return {
      outcome: "warn",
      rationale: `coderabbitai did not run (${evidence.reason}) -- findings were not evaluated. Expected in CI, where review is delegated to the ${evidence.expectedProvider}.${note}`,
    }
  }

  if (evidence.status === "unavailable") {
    const note =
      evidence.existingRecordCount > 0
        ? ` ${String(evidence.existingRecordCount)} exception record(s) in ${evidence.registryPath} were validated but not reconciled (no review ran).`
        : ""
    return {
      outcome: "warn",
      rationale: `coderabbitai did not run (${evidence.reason}) -- findings were not evaluated. Install the CodeRabbit CLI (https://docs.coderabbit.ai/cli) and run from a real branch to enable real enforcement.${note}`,
    }
  }

  if (evidence.status === "error") {
    return { outcome: "fail", rationale: `coderabbitai review failed: ${evidence.message}` }
  }

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    CODERABBIT_EXCEPTION_SCHEMA,
  )
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "coderabbitai evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const findingIds = evidence.findings.map((finding) => finding.id)
  const activeIds = new Set(Object.keys(evidence.activeExceptions))
  const bijectionErrors: string[] = []
  if (new Set(findingIds).size !== findingIds.length)
    bijectionErrors.push("evidence.findings contains duplicate ids.")
  for (const id of new Set(findingIds)) {
    if (!activeIds.has(id))
      bijectionErrors.push(`finding ${JSON.stringify(id)} has no active exception record.`)
  }
  for (const id of activeIds) {
    if (!findingIds.includes(id))
      bijectionErrors.push(`active exception ${JSON.stringify(id)} matches no finding.`)
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "coderabbitai evidence broke the findings <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale exception in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- CodeRabbit no longer raises this finding (or its wording changed); delete this entry.`,
  )

  const determinants = evidence.findings.map((finding) => ({
    finding,
    ...evaluateFinding(finding, evidence.activeExceptions[finding.id]),
  }))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  if (offenders.length === 0 && staleLines.length === 0) {
    return {
      outcome: "pass",
      rationale: `${String(evidence.findings.length)} CodeRabbit finding(s) evaluated: all permitted by a complete exception record.`,
    }
  }

  const offenderLines = offenders.map((d) => {
    const detail =
      d.verdict === "forbidden"
        ? "forbidden by policy"
        : d.verdict === "unmatched"
          ? "no reconciled exception record (registry integrity failure)"
          : `exception incomplete (missing: ${d.missing.join(", ")})`
    return `- ${d.finding.file} [${d.finding.severity}]: ${detail} -- ${d.finding.summary}`
  })

  return {
    outcome: "fail",
    rationale: [
      `${String(offenders.length + evidence.staleExceptions.length)} CodeRabbit finding(s) or stale record(s) need attention:`,
      ...offenderLines,
      ...staleLines,
    ].join("\n"),
  }
}

// Promotes the former local-only `coderabbit review --agent` shell step into a real, always-
// declared check -- see specs/decisions/0014-coderabbit-as-a-surfaced-check.md. Its own
// non-execution (in CI, or locally when the CLI isn't installed) is recorded and surfaced as a
// warn on every run.
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
