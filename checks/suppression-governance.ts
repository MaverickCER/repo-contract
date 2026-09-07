import { validateExceptionPolicyConfig } from "../src/helpers/index.js"
import type { SuppressionGovernanceEvidence } from "../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionPolicyConfig,
  SuppressionRequirement,
} from "../scripts/suppression-governance/policy-config.js"
import { suppressionPolicy } from "../scripts/suppression-governance/policy-config.js"
import { validateSuppressionRegistry } from "../scripts/suppression-governance/registry.js"
import { evaluateRecord, formatOffender } from "../scripts/suppression-governance/resolve-policy.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Every field name a `SuppressionPolicy`'s `"exception"` mode may require -- passed to
 * `validateExceptionPolicyConfig` as its `validRequirements` set so a policy naming anything
 * outside this closed set (a typo, a field that doesn't exist on `DisableCommentRecord`) is a
 * configuration error, not a silently-ignored no-op. Kept in sync with `SuppressionRequirement`
 * (`scripts/suppression-governance/policy-config.ts`) by the same derivation-safety convention
 * `evidence-types.ts`'s `SUPPRESSION_CATEGORIES`/`VERIFICATION_METHODS` already use elsewhere in
 * this feature.
 */
const VALID_REQUIREMENTS: readonly SuppressionRequirement[] = [
  "justification",
  "alternatives",
  "remediation",
  "category",
  "verificationMethod",
  "reason",
]

interface EvaluateSuppressionGovernancePolicyInput {
  readonly evidence: SuppressionGovernanceEvidence
  readonly policyConfig?: SuppressionPolicyConfig
}

/**
 * Evaluates the check's own emitted evidence against `suppressionPolicy` -- never re-parses or
 * re-scans source. `evidence` is re-validated here (`validateSuppressionRegistry`) as defense in
 * depth even though the check script already validated it once before synchronizing: this policy
 * must never trust a registry blindly just because it arrived as evidence.
 * @param input - The evidence to evaluate, and (for tests) the policy config to evaluate it against.
 * @returns The check's `PolicyResult`.
 */
export function evaluateSuppressionGovernancePolicy(
  input: EvaluateSuppressionGovernancePolicyInput,
): PolicyResult {
  const { evidence, policyConfig = suppressionPolicy } = input

  if (!evidence.ok) {
    const errors = evidence.registryValidationErrors
      ? `\n${evidence.registryValidationErrors.map((e) => `- ${e}`).join("\n")}`
      : ""
    return { outcome: "fail", rationale: `${evidence.error}${errors}` }
  }

  const revalidated = validateSuppressionRegistry(evidence.records)
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "Suppression-governance evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const configErrors = validateExceptionPolicyConfig(policyConfig, VALID_REQUIREMENTS)
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: ["suppressionPolicy is misconfigured:", ...configErrors.map((e) => `- ${e}`)].join(
        "\n",
      ),
    }
  }

  const determinants = evidence.records.map((record) => evaluateRecord(record, policyConfig))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  const summary =
    `${String(evidence.records.length)} suppression(s) tracked ` +
    `(${String(evidence.newCount)} new, ${String(evidence.movedCount)} moved, ${String(evidence.removedCount)} removed); ` +
    `${String(offenders.length)} forbidden or under-justified.`

  if (offenders.length === 0) {
    return { outcome: "pass", rationale: summary }
  }

  return {
    outcome: "fail",
    rationale: [summary, ...offenders.map((d) => `- ${formatOffender(d)}`)].join("\n"),
  }
}

// See specs/decisions/0006-suppression-governance.md for why suppression discovery (finding
// eslint-disable/@ts-ignore/etc. comments and their source ranges) is owned entirely by
// scripts/suppression-governance/check.ts -- this policy only ever reads that script's already-
// synchronized evidence and applies suppressionPolicy to it.
export const suppressionGovernance: CheckDefinitionConfig = {
  run: ["tsx", "scripts/suppression-governance/check.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<SuppressionGovernanceEvidence>(
      result.output,
      "Suppression-governance check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSuppressionGovernancePolicy({ evidence: parsed.value })
  },
}
