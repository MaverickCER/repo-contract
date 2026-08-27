import type { ApiContractEvidence } from "../scripts/api-contract/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateApiContractPolicyInput {
  readonly evidence: ApiContractEvidence
}

interface ApiContractDeterminant {
  readonly summary: string
  readonly staleLiteralExplanations: readonly string[]
  readonly impactUnknown: boolean
  readonly currentVersion: string
  readonly minimumVersionLine: string | undefined
  readonly changesetLine: string
  readonly lowerTierLine: string | undefined
}

// Exhaustive over ChangesetEvidence["action"] with no fallback branch --
// noImplicitReturns then makes a future action variant a compile error here
// instead of a silently-blank rationale line, per ADR 0008's "removed" variant.
/**
 * Renders the changeset action recorded in `evidence` as a single human-readable rationale line.
 * @param evidence - the api-contract check's evidence, whose `changeset.action` selects the wording.
 * @returns the rendered rationale line for the changeset action taken.
 */
function formatChangesetLine(evidence: ApiContractEvidence): string {
  const changeset = evidence.changeset
  switch (changeset.action) {
    case "none":
      return "No changeset action was needed."
    case "created":
      return `Changeset created: ${changeset.path ?? "(unknown path)"} (release level: ${changeset.effectiveReleaseLevel ?? changeset.requiredReleaseLevel ?? "unknown"}).`
    case "updated": {
      const human = changeset.humanReleaseLevel
      const effective = changeset.effectiveReleaseLevel
      const levels = human
        ? ` Human release level: ${human}. Effective release level: ${effective ?? human}.`
        : ""
      return `Changeset updated: ${changeset.path ?? "(unknown path)"}.${levels}`
    }
    case "unchanged":
      return `Changeset already up to date: ${changeset.path ?? "(unknown path)"}.`
    case "removed":
      return `Stale changeset removed: ${changeset.path ?? "(unknown path)"}.`
  }
}

/**
 * Reduces the raw api-contract evidence down to the fields the policy below actually branches on.
 * @param evidence - the api-contract check's evidence to summarize.
 * @returns the determinant fields (summary, stale-literal explanations, impact, version lines) the policy evaluates.
 */
function getApiContractDeterminant(evidence: ApiContractEvidence): ApiContractDeterminant {
  return {
    summary: evidence.summary,
    staleLiteralExplanations: evidence.diff
      .filter((change) => change.kind === "schema-version-literal-stale")
      .map((change) => change.explanation),
    impactUnknown: evidence.impact === "unknown",
    currentVersion: evidence.currentVersion,
    minimumVersionLine:
      evidence.minimumRequiredVersion !== undefined
        ? `Minimum required version if released now: ${evidence.minimumRequiredVersion}.`
        : undefined,
    changesetLine: formatChangesetLine(evidence),
    // Informational only -- never affects impact/requiredLevel/minimumRequiredVersion
    // (ADR 0008) -- surfaced regardless of outcome.
    lowerTierLine:
      evidence.lowerTierDiff.length > 0
        ? `${String(evidence.lowerTierDiff.length)} non-public change(s) also detected (informational only).`
        : undefined,
  }
}

/**
 * Under this repository's real release workflow (Changesets), `package.json`'s version stays at
 * the last-released value throughout normal development -- comparing it against
 * `evidence.minimumRequiredVersion` during a feature PR would spuriously fail almost every time,
 * since the version genuinely isn't meant to move until a separate, later "Version Packages" PR
 * bumps it. So this policy is advisory (pass/warn, reporting what the check did to a Changesets
 * file) rather than gating on that comparison -- with exactly one exception: a
 * `schema-version-literal-stale` finding is a genuine internal defect (a schema's shape changed
 * without its own version literal being bumped, per VERSIONING.md's own policy), not a
 * "not released yet" false positive, and always fails.
 * @param root0 - the policy input.
 * @param root0.evidence - the api-contract check's evidence to evaluate.
 * @returns the pass/warn/fail outcome and its rationale.
 */
export function evaluateApiContractPolicy({
  evidence,
}: EvaluateApiContractPolicyInput): PolicyResult {
  const determinant = getApiContractDeterminant(evidence)

  if (determinant.staleLiteralExplanations.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `Contract impact: ${determinant.summary}`,
        "",
        "Internal schema-version consistency violation(s):",
        ...determinant.staleLiteralExplanations.map((explanation) => `- ${explanation}`),
        ...(determinant.lowerTierLine ? ["", determinant.lowerTierLine] : []),
      ].join("\n"),
    }
  }

  if (determinant.impactUnknown) {
    return {
      outcome: "warn",
      rationale: [
        `Contract impact: ${determinant.summary}`,
        "",
        `The public contract could not be deterministically classified, so no minimum required ` +
          `version can be established. package.json currently declares ${determinant.currentVersion}. ` +
          "Manual review -- and, if appropriate, a hand-authored changeset -- is required.",
        ...(determinant.lowerTierLine ? ["", determinant.lowerTierLine] : []),
      ].join("\n"),
    }
  }

  return {
    outcome: "pass",
    rationale: [
      `Contract impact: ${determinant.summary}`,
      "",
      ...(determinant.minimumVersionLine ? [determinant.minimumVersionLine] : []),
      determinant.changesetLine,
      ...(determinant.lowerTierLine ? ["", determinant.lowerTierLine] : []),
    ].join("\n"),
  }
}

// API Extractor is kept entirely internal to scripts/api-contract/ -- see
// specs/decisions/0008-api-contract-compatibility-gate.md.
// check.ts owns contract extraction/diffing/impact/minimum version and
// changeset maintenance; the policy above only interprets its evidence,
// never inspects TypeScript/API Extractor/source/Git itself.
export const apiContract: CheckDefinitionConfig = {
  run: ["tsx", "scripts/api-contract/check.ts", "--release-tag=public"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<ApiContractEvidence>(
      result.output,
      "API contract check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateApiContractPolicy({ evidence: parsed.value })
  },
}
