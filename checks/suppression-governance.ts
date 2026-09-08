import { validateExceptionPolicyConfig } from "../src/helpers/index.js"
import {
  SUPPRESSION_EXCEPTION_SCHEMA,
  validateExceptionRegistry,
} from "../scripts/suppression-governance/evidence-types.js"
import type { SuppressionGovernanceEvidence } from "../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionPolicyConfig,
  SuppressionRequirement,
} from "../scripts/suppression-governance/policy-config.js"
import { suppressionPolicy } from "../scripts/suppression-governance/policy-config.js"
import {
  evaluateFinding,
  formatOffender,
} from "../scripts/suppression-governance/resolve-policy.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Every field name a `SuppressionPolicy`'s `"exception"` mode may require -- passed to
 * `validateExceptionPolicyConfig` as its `validRequirements` set so a policy naming anything
 * outside this closed set is a configuration error, not a silently-ignored no-op. Kept in sync
 * with `SuppressionRequirement` (`scripts/suppression-governance/policy-config.ts`) by the same
 * derivation-safety convention `evidence-types.ts`'s enums use.
 */
const VALID_REQUIREMENTS: readonly SuppressionRequirement[] = [
  "justification",
  "category",
  "verificationMethod",
  "reason",
]

interface EvaluateSuppressionGovernancePolicyInput {
  readonly evidence: SuppressionGovernanceEvidence
  readonly policyConfig?: SuppressionPolicyConfig
}

/**
 * Evaluates the check's own emitted evidence against `suppressionPolicy` -- a pure
 * evidence->verdict function that never re-parses or re-scans source (ADR 0001). Finding-centric:
 * every raw finding gets exactly one decision; a stale exception record (its finding gone) fails;
 * a scaffolded stub (blank `justification`) fails whenever its rule resolves to `"exception"` mode
 * (an `"allowed"`-mode rule -- e.g. `no-console`, `@ts-expect-error` -- permits a blank stub, and
 * `"forbidden"` fails a stub regardless of what is in it).
 *
 * The reconciled records are re-validated here (`validateExceptionRegistry`) as defense in depth
 * even though the check already validated them once -- this policy must never trust a registry
 * blindly just because it arrived as evidence -- and the `findings <-> activeExceptions` bijection
 * the check promises is asserted, not assumed.
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

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    SUPPRESSION_EXCEPTION_SCHEMA,
  )
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

  const findingIds = evidence.findings.map((finding) => finding.id)
  const uniqueFindingIds = new Set(findingIds)
  const activeIds = new Set(Object.keys(evidence.activeExceptions))
  const bijectionErrors: string[] = []
  if (uniqueFindingIds.size !== findingIds.length) {
    bijectionErrors.push("evidence.findings contains duplicate ids.")
  }
  for (const id of uniqueFindingIds) {
    if (!activeIds.has(id))
      bijectionErrors.push(`finding ${JSON.stringify(id)} has no active exception record.`)
  }
  for (const id of activeIds) {
    if (!uniqueFindingIds.has(id)) {
      bijectionErrors.push(
        `active exception ${JSON.stringify(id)} matches no finding (should be stale, not active).`,
      )
    }
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "Suppression-governance evidence broke the findings <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const determinants = evidence.findings.map((finding) =>
    evaluateFinding(finding, evidence.activeExceptions[finding.id], policyConfig),
  )
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale exception in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- its directive is gone; delete this entry (carry its justification to the new location first if the directive merely moved).`,
  )

  const summary =
    `${String(evidence.findings.length)} suppression(s) tracked ` +
    `(${String(evidence.scaffoldedIds.length)} newly scaffolded, ${String(evidence.staleExceptions.length)} stale); ` +
    `${String(offenders.length)} forbidden or under-justified.`

  if (offenders.length === 0 && staleLines.length === 0) {
    return { outcome: "pass", rationale: summary }
  }

  const scaffoldNote =
    evidence.scaffoldedIds.length > 0
      ? [
          `Scaffolded ${String(evidence.scaffoldedIds.length)} stub(s) in ${evidence.registryPath} -- fill in "justification" (and "category"/"verificationMethod").`,
        ]
      : []

  return {
    outcome: "fail",
    rationale: [
      summary,
      ...scaffoldNote,
      ...offenders.map((d) => `- ${formatOffender(d)}`),
      ...staleLines,
    ].join("\n"),
  }
}

// See specs/decisions/0006-suppression-governance.md for why suppression discovery (finding
// eslint-disable/@ts-ignore/etc. comments and their source ranges) plus registry reconciliation
// is owned entirely by scripts/suppression-governance/check.ts -- this policy only ever reads that
// script's already-reconciled evidence and applies suppressionPolicy to it.
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
