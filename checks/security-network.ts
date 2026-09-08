import { evaluateExceptionRecord, validateExceptionPolicyConfig } from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  NetworkCapabilityFinding,
  NetworkExceptionRecord,
  NetworkScanEvidence,
} from "../scripts/security-network/evidence-types.js"
import {
  SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY,
  VALID_SECURITY_NETWORK_REQUIREMENTS,
  securityNetworkPolicy,
} from "../scripts/security-network/policy-config.js"
import { NETWORK_EXCEPTION_SCHEMA } from "../scripts/security-network/registry.js"
import { validateExceptionRegistry } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Reads one required field's current string value straight off a reconciled record.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
function networkFieldValue(record: NetworkExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Evaluates one finding against `securityNetworkPolicy`, classified purely on its `capability`.
 * @param finding - The finding.
 * @param record - The reconciled live record for it, or `undefined` if the bijection broke.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateFinding(
  finding: NetworkCapabilityFinding,
  record: NetworkExceptionRecord | undefined,
): {
  readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"
  readonly missing: readonly string[]
} {
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "security-network", category: finding.capability },
  ]
  const determinant = evaluateExceptionRecord({
    record,
    classifications,
    config: securityNetworkPolicy,
    globalDefault: SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY,
    fieldValue: networkFieldValue,
  })
  return { verdict: determinant.verdict, missing: determinant.missing }
}

/**
 * Renders one finding: `file:line:column [capability] detail`.
 * @param finding - The finding to render.
 * @returns The single-line rendering.
 */
function renderFinding(finding: NetworkCapabilityFinding): string {
  return `${finding.file}:${String(finding.line)}:${String(finding.column)} [${finding.capability}] ${finding.detail}`
}

/**
 * Fails whenever scripts/security-network/scan.ts found any prohibited (or unverifiable) network
 * capability in `src/**\/*.ts` not backed by a complete exception record, or a stale record whose
 * finding is gone. A pure evidence->verdict function -- the scan script owns loading, reconciling,
 * and writing `.repo-contract/exceptions/security-network.json`. A zero-file scan still fails.
 * @param input - Wraps the scan evidence.
 * @param input.evidence - The `NetworkScanEvidence` emitted by scan.ts.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateSecurityNetworkPolicy(input: {
  readonly evidence: NetworkScanEvidence
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
    securityNetworkPolicy,
    VALID_SECURITY_NETWORK_REQUIREMENTS,
  )
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "securityNetworkPolicy is misconfigured:",
        ...configErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    NETWORK_EXCEPTION_SCHEMA,
  )
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "security-network evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  if (evidence.filesScanned === 0) {
    return {
      outcome: "fail",
      rationale:
        "security-network scan reported zero files scanned under src/ -- a clean result from an " +
        "empty scan is not evidence of a network-free surface. Check the scan's file discovery.",
    }
  }

  const findingIds = evidence.findings.map((finding) => finding.id)
  const activeIds = new Set(Object.keys(evidence.activeExceptions))
  const bijectionErrors: string[] = []
  if (new Set(findingIds).size !== findingIds.length) {
    bijectionErrors.push("evidence.findings contains duplicate ids.")
  }
  for (const id of new Set(findingIds)) {
    if (!activeIds.has(id))
      bijectionErrors.push(`finding ${JSON.stringify(id)} has no active exception record.`)
  }
  for (const id of activeIds) {
    if (!findingIds.includes(id)) {
      bijectionErrors.push(`active exception ${JSON.stringify(id)} matches no finding.`)
    }
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "security-network evidence broke the findings <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale exception in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- its finding is gone; delete this entry.`,
  )

  if (evidence.findings.length === 0) {
    if (staleLines.length === 0) {
      return {
        outcome: "pass",
        rationale: `No prohibited network capability found across ${String(evidence.filesScanned)} file(s) under src/.`,
      }
    }
    return {
      outcome: "fail",
      rationale: [
        `No prohibited network capability found across ${String(evidence.filesScanned)} file(s) under src/, but the registry has stale records:`,
        ...staleLines,
      ].join("\n"),
    }
  }

  const determinants = evidence.findings.map((finding) => ({
    finding,
    ...evaluateFinding(finding, evidence.activeExceptions[finding.id]),
  }))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  if (offenders.length === 0 && staleLines.length === 0) {
    return {
      outcome: "pass",
      rationale: `Every network capability finding across ${String(evidence.filesScanned)} file(s) under src/ is backed by a complete exception record (${String(evidence.findings.length)} finding(s)).`,
    }
  }

  const offenderLines = offenders.map((d) => {
    const detail =
      d.verdict === "forbidden"
        ? "forbidden by policy (no waiver path for this capability kind)"
        : d.verdict === "unmatched"
          ? "no reconciled exception record (registry integrity failure)"
          : `exception incomplete (missing: ${d.missing.join(", ")})`
    return `- ${renderFinding(d.finding)} -- ${detail}`
  })

  return {
    outcome: "fail",
    rationale: [
      `${String(offenders.length + evidence.staleExceptions.length)} prohibited/unverifiable network capability finding(s) or stale record(s) across ${String(evidence.filesScanned)} file(s) scanned under src/:`,
      ...offenderLines,
      ...staleLines,
      `src/ must never perform network I/O directly -- see SECURITY.md's network-free surface guarantee. A reviewed exception requires a complete record in ${evidence.registryPath} (justification, alternatives, remediation, method, exceptionType).`,
    ].join("\n"),
  }
}

// Second, independent layer of the "no network calls" invariant -- see eslint.config.js's own doc
// comment on the first (ESLint) layer, and specs/decisions/0007-no-network-surface.md. This
// check's own script (scripts/security-network/scan.ts) never invokes ESLint, so a silently
// weakened/removed ESLint rule or a suppressed violation still fails here.
export const securityNetwork: CheckDefinitionConfig = {
  run: ["tsx", "scripts/security-network/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<NetworkScanEvidence>(
      result.output,
      "security-network check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSecurityNetworkPolicy({ evidence: parsed.value })
  },
}
