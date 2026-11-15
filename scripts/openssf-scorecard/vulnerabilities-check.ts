import type { CheckEvidence } from "../../src/types.js"
import type { ScorecardCheckResult } from "./types.js"

interface NpmAuditVulnerabilityCounts {
  readonly critical: number
  readonly high: number
  readonly moderate: number
  readonly low: number
}
interface NpmAuditReport {
  // Optional, not required: this type describes untrusted JSON cast from `unknown`. When npm
  // audit can't complete the scan (a registry/network error), its documented failure shape is
  // `{ "error": {...} }`, with no "metadata" key at all. A required field here would assert a
  // guarantee this cast doesn't have.
  readonly metadata?: { readonly vulnerabilities: NpmAuditVulnerabilityCounts }
}

/**
 * Upstream scoring: 10 for no unfixed vulnerabilities (upstream's OSV-
 * service query), 0 for any open unfixed vulnerability. This repository
 * already runs its `security-deps` check every contract run (`npm audit`
 * against the production dependency tree). Rather than a second,
 * independently-computed OSV query, this evaluation reads that SAME
 * evidence via `dependsOn`. That follows this repository's
 * evidentiary-traceability rule: no claim without a traceable evidence
 * source. It also never adds a duplicate, potentially-divergent source for a
 * fact this repository already establishes elsewhere in the same run.
 * @param securityDepsEvidence - The `security-deps` check's `CheckEvidence` (via this check's `dependsOn`).
 * @returns The Vulnerabilities sub-check result.
 */
export function evaluateVulnerabilities(
  securityDepsEvidence: CheckEvidence | undefined,
): ScorecardCheckResult {
  if (!securityDepsEvidence?.output?.success) {
    return {
      name: "Vulnerabilities",
      score: "not-applicable",
      reason:
        "The security-deps check's evidence was not available (it may not have run in this pass, or its output could not be parsed).",
      details: [],
    }
  }
  const report = securityDepsEvidence.output.value as NpmAuditReport | undefined
  // `report` can be truthy but carry no "metadata" at all. When npm audit can't complete the scan
  // (a registry/network error), its documented failure shape is `{ "error": {...} }`, with
  // neither "metadata" nor "vulnerabilities". A transient npm-registry outage produces this
  // shape. It falls through to the "not-applicable" branch below, like every other
  // malformed-report case, instead of throwing a TypeError.
  const counts = report?.metadata?.vulnerabilities
  if (!counts) {
    return {
      name: "Vulnerabilities",
      score: "not-applicable",
      reason: "security-deps evidence did not contain a parseable npm audit vulnerability count.",
      details: [],
    }
  }
  const total = counts.critical + counts.high + counts.moderate + counts.low
  if (total === 0) {
    return {
      name: "Vulnerabilities",
      score: 10,
      reason:
        "This run's security-deps check (npm audit) found 0 critical/high/moderate/low vulnerabilities.",
      details: [],
    }
  }
  return {
    name: "Vulnerabilities",
    score: 0,
    reason: `This run's security-deps check (npm audit) found ${String(counts.critical)} critical, ${String(counts.high)} high, ${String(counts.moderate)} moderate, and ${String(counts.low)} low-severity vulnerabilities.`,
    details: [],
  }
}
