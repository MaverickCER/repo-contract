import type { DeadCodeEvidence } from "../scripts/dead-code/evidence-types.js"
import { DEAD_CODE_EXCEPTION_SCHEMA } from "../scripts/dead-code/registry.js"
import { validateExceptionRegistry } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Fails whenever knip reports a dead-code/unused-dependency issue with no complete reviewed
 * record in `.repo-contract/exceptions/dead-code.json`, or a stale record whose finding is gone. A
 * pure evidence->verdict function -- the check script owns running knip raw (no exemptions),
 * reconciling, and writing the registry.
 *
 * The only field a record needs is a non-empty `justification`: why this dependency/export is
 * genuinely needed despite knip's static analysis not seeing a use (a dynamic `require`, a
 * spawned-by-name CLI, a GitHub Actions workflow reference, ...).
 * @param input - Wraps the check's own emitted evidence.
 * @param input.evidence - The `DeadCodeEvidence` emitted by check.ts.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateDeadCodePolicy(input: {
  readonly evidence: DeadCodeEvidence
}): PolicyResult {
  const { evidence } = input

  if (!evidence.ok) {
    return { outcome: "fail", rationale: evidence.error }
  }

  if (evidence.registryError !== undefined) {
    return {
      outcome: "fail",
      rationale: [
        `${evidence.registryPath} failed to load or reconcile and was left unchanged:`,
        ...evidence.registryError.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    DEAD_CODE_EXCEPTION_SCHEMA,
  )
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "dead-code evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
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
    if (!findingIds.includes(id))
      bijectionErrors.push(`active exception ${JSON.stringify(id)} matches no finding.`)
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "dead-code evidence broke the findings <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale record in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- knip no longer reports "${record.name}" as ${record.kind}; delete this entry.`,
  )
  const underjustified = evidence.findings.filter(
    (finding) => (evidence.activeExceptions[finding.id]?.justification.trim().length ?? 0) === 0,
  )
  const underjustifiedLines = underjustified.map(
    (finding) =>
      `- ${finding.kind}: "${finding.name}" (${finding.file}${finding.location}) -- fill in "justification": why this is genuinely needed despite knip reporting it unused.`,
  )

  if (staleLines.length === 0 && underjustifiedLines.length === 0) {
    return {
      outcome: "pass",
      rationale:
        evidence.findings.length === 0
          ? "Knip reported 0 issues."
          : `${String(evidence.findings.length)} knip finding(s), each backed by a reviewed record.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(underjustifiedLines.length + staleLines.length)} dead-code issue(s):`,
      ...underjustifiedLines,
      ...staleLines,
    ].join("\n"),
  }
}

// Self-hosted (not the published `deadCode` preset from src/presets/dead-code.ts, which this
// repository's own run deliberately does not use -- see scripts/dead-code/check.ts's own doc
// comment for why a config-time exempt list can't express a reconciled registry) -- see
// specs/decisions/0008-self-hosting-tool-and-dependency-choices.md's amendment.
export const deadCode: CheckDefinitionConfig = {
  run: ["tsx", "scripts/dead-code/check.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<DeadCodeEvidence>(
      result.output,
      "dead-code check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateDeadCodePolicy({ evidence: parsed.value })
  },
}
