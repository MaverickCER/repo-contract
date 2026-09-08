import { evaluateExceptionRecord, validateExceptionPolicyConfig } from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  NormalizedSocketAlert,
  SecuritySocketEvidence,
  SocketExceptionRecord,
} from "../scripts/security-socket/evidence-types.js"
import {
  SOCKET_GLOBAL_DEFAULT_POLICY,
  VALID_SOCKET_REQUIREMENTS,
  socketPolicy,
} from "../scripts/security-socket/policy-config.js"
import { SOCKET_EXCEPTION_SCHEMA } from "../scripts/security-socket/registry.js"
import { validateExceptionRegistry } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Reads one required field's current string value straight off a reconciled record.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
function socketFieldValue(record: SocketExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Evaluates one alert against `socketPolicy`, classified purely on its `severity`.
 * @param alert - The alert.
 * @param record - The reconciled live record for it, or `undefined` if the bijection broke.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateAlert(
  alert: NormalizedSocketAlert,
  record: SocketExceptionRecord | undefined,
): {
  readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"
  readonly missing: readonly string[]
} {
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "socket", category: alert.severity },
  ]
  const determinant = evaluateExceptionRecord({
    record,
    classifications,
    config: socketPolicy,
    globalDefault: SOCKET_GLOBAL_DEFAULT_POLICY,
    fieldValue: socketFieldValue,
  })
  return { verdict: determinant.verdict, missing: determinant.missing }
}

/**
 * Evaluates the `security-socket` check's own emitted evidence -- a pure evidence->verdict
 * function; the scan script owns loading, reconciling, and writing
 * `.repo-contract/exceptions/socket.json`. `unavailable` (CLI not installed / not authenticated /
 * unreachable) is a `warn`, never a `fail` -- this check cannot distinguish "genuinely clean" from
 * "never ran". `error` (a malformed report) fails closed. A malformed/unreconcilable registry
 * (`registryError`) fails regardless of status. A `passed`/`failed` scan: any `forbidden` /
 * `insufficient` / `unmatched` verdict or stale record fails, listed individually.
 * @param input - Wraps the evidence to evaluate.
 * @param input.evidence - The `SecuritySocketEvidence` emitted by scan.ts.
 * @returns The check's `PolicyResult`.
 */
export function evaluateSecuritySocketPolicy(input: {
  readonly evidence: SecuritySocketEvidence
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

  const configErrors = validateExceptionPolicyConfig(socketPolicy, VALID_SOCKET_REQUIREMENTS)
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: ["socketPolicy is misconfigured:", ...configErrors.map((e) => `- ${e}`)].join(
        "\n",
      ),
    }
  }

  if (evidence.status === "unavailable") {
    const note =
      evidence.existingRecordCount > 0
        ? ` ${String(evidence.existingRecordCount)} exception record(s) in ${evidence.registryPath} were validated but not reconciled (the CLI produced no alert list this run).`
        : ""
    return {
      outcome: "warn",
      rationale: `security-socket did not run (${evidence.reason}) -- alerts were not evaluated. Install and authenticate @socketsecurity/cli to enable real enforcement.${note}`,
    }
  }

  if (evidence.status === "error") {
    return { outcome: "fail", rationale: `security-socket scan failed: ${evidence.message}` }
  }

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    SOCKET_EXCEPTION_SCHEMA,
  )
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "security-socket evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const alertIds = evidence.alerts.map((alert) => alert.id)
  const activeIds = new Set(Object.keys(evidence.activeExceptions))
  const bijectionErrors: string[] = []
  if (new Set(alertIds).size !== alertIds.length)
    bijectionErrors.push("evidence.alerts contains duplicate ids.")
  for (const id of new Set(alertIds)) {
    if (!activeIds.has(id))
      bijectionErrors.push(`alert ${JSON.stringify(id)} has no active exception record.`)
  }
  for (const id of activeIds) {
    if (!alertIds.includes(id))
      bijectionErrors.push(`active exception ${JSON.stringify(id)} matches no alert.`)
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "security-socket evidence broke the alerts <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale exception in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- Socket no longer raises this alert; delete this entry.`,
  )

  const determinants = evidence.alerts.map((alert) => ({
    alert,
    ...evaluateAlert(alert, evidence.activeExceptions[alert.id]),
  }))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  if (offenders.length === 0 && staleLines.length === 0) {
    return {
      outcome: "pass",
      rationale: `${String(evidence.alerts.length)} Socket alert(s) evaluated: all permitted by a complete exception record.`,
    }
  }

  const offenderLines = offenders.map((d) => {
    const detail =
      d.verdict === "forbidden"
        ? "forbidden by policy (above medium severity)"
        : d.verdict === "unmatched"
          ? "no reconciled exception record (registry integrity failure)"
          : `exception incomplete (missing: ${d.missing.join(", ")})`
    return `- ${d.alert.id} [${d.alert.severity}]: ${detail}`
  })

  return {
    outcome: "fail",
    rationale: [
      `${String(offenders.length + evidence.staleExceptions.length)} Socket alert(s) or stale record(s) need attention:`,
      ...offenderLines,
      ...staleLines,
    ].join("\n"),
  }
}

// Rejects any alert above a medium ("middle") rating outright, and requires a complete
// finding-specific exception for everything else -- see
// specs/decisions/0013-reusable-exception-policy-helper.md.
export const securitySocket: CheckDefinitionConfig = {
  run: ["tsx", "scripts/security-socket/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<SecuritySocketEvidence>(
      result.output,
      "security-socket check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSecuritySocketPolicy({ evidence: parsed.value })
  },
}
