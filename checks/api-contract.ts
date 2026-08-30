import type {
  ApiContractEvidence,
  RequiredReleaseLevel,
} from "../scripts/api-contract/evidence-types.js"
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
  readonly requiredLevel: RequiredReleaseLevel | undefined
  readonly declaredLevel: RequiredReleaseLevel
  readonly commitsSatisfied: boolean | null
  readonly commitsLine: string
  readonly breakingChangePaths: readonly string[]
  readonly lowerTierLine: string | undefined
}

/**
 * Renders what the branch's commits declare vs. what the API diff requires, as one rationale line.
 * @param evidence - the api-contract check's evidence.
 * @returns the rendered "declared X / required Y" line.
 */
function formatCommitsLine(evidence: ApiContractEvidence): string {
  const { declaredLevel, analyzed, prTitleConsidered } = evidence.commits
  const required = evidence.requiredLevel ?? "unknown"
  const scope = prTitleConsidered
    ? `${String(analyzed)} message(s) incl. the PR title`
    : `${String(analyzed)} branch commit(s)`
  return `Release level: ${scope} declare \`${declaredLevel}\`; the API diff requires \`${required}\`.`
}

/**
 * Reduces the raw api-contract evidence down to the fields the policy below branches on.
 * @param evidence - the api-contract check's evidence to summarize.
 * @returns the determinant fields the policy evaluates.
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
    requiredLevel: evidence.requiredLevel,
    declaredLevel: evidence.commits.declaredLevel,
    commitsSatisfied: evidence.commits.satisfied,
    commitsLine: formatCommitsLine(evidence),
    breakingChangePaths: evidence.diff
      .filter((change) => change.compatibility === "breaking")
      .map((change) => change.path),
    // Informational only -- never affects impact/requiredLevel/minimumRequiredVersion
    // (ADR 0008) -- surfaced regardless of outcome.
    lowerTierLine:
      evidence.lowerTierDiff.length > 0
        ? `${String(evidence.lowerTierDiff.length)} non-public change(s) also detected (informational only).`
        : undefined,
  }
}

/**
 * Versioning is Conventional-Commits-driven (ADR 0008): release-please derives the version from
 * the commit types, so this check can and does **gate** -- it fails a PR whose commits declare a
 * smaller bump than the public-API diff requires (a breaking API change committed as `fix:`,
 * etc.). It also fails on an internal schema-version literal that changed shape without its own
 * version marker being bumped, and warns (rather than gating) when the contract delta could not
 * be classified deterministically -- that case still needs a human to confirm the declared bump.
 * It cannot catch a behavioral breaking change with an unchanged type signature; that remains a
 * human-review concern (see ADR 0008's stated limitation).
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

  if (determinant.commitsSatisfied === false) {
    const breaking = determinant.breakingChangePaths
    return {
      outcome: "fail",
      rationale: [
        `Contract impact: ${determinant.summary}`,
        "",
        determinant.commitsLine,
        ...(breaking.length > 0
          ? ["", `Breaking public-API change(s): ${breaking.map((p) => `\`${p}\``).join(", ")}.`]
          : []),
        "",
        `The commits on this branch do not declare a \`${determinant.requiredLevel ?? "?"}\` ` +
          `release. Add \`!\` after the type (e.g. \`feat!:\`) or a \`BREAKING CHANGE:\` footer ` +
          `to the commit that makes this change, so release-please bumps the version correctly.`,
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
          `level can be established. The branch's commits declare \`${determinant.declaredLevel}\`. ` +
          `Manually confirm that is an appropriate bump for this change.`,
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
      determinant.commitsLine,
      ...(determinant.lowerTierLine ? ["", determinant.lowerTierLine] : []),
    ].join("\n"),
  }
}

// API Extractor is kept entirely internal to scripts/api-contract/ -- see
// specs/decisions/0008-api-contract-compatibility-gate.md.
// check.ts owns contract extraction/diffing/impact/minimum-level derivation and
// compares the required level against what the branch's Conventional Commits
// (and, in CI, the PR title) declare; the policy above only interprets its
// evidence, never inspects TypeScript/API Extractor/source/Git itself.
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
