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

const VALID_MODES = ["forbidden", "allowed", "exception"] as const
const VALID_REQUIREMENTS: readonly SuppressionRequirement[] = [
  "justification",
  "alternatives",
  "remediation",
  "category",
  "verificationMethod",
  "reason",
]

/**
 * Validates one `SuppressionPolicy` value's shape -- `mode` must be one of the three recognized
 * modes, and an `"exception"` mode's `requirements` must be a non-empty array drawn only from
 * `VALID_REQUIREMENTS` (an empty `requirements` array is rejected rather than silently treated as
 * equivalent to `"allowed"` -- if nothing is required, `"allowed"` is the correct, unambiguous way
 * to say so).
 * @param value - The candidate policy value to validate.
 * @param location - Where this value lives in `suppressionPolicy`, for error messages.
 * @param errors - Accumulates every configuration problem found.
 */
function validateSuppressionPolicyValue(value: unknown, location: string, errors: string[]): void {
  if (typeof value !== "object" || value === null) {
    errors.push(`${location} must be an object.`)
    return
  }

  const { mode, requirements } = value as Record<string, unknown>

  if (mode === "forbidden" || mode === "allowed") return

  if (mode !== "exception") {
    errors.push(
      `${location}.mode must be one of ${VALID_MODES.map((m) => `"${m}"`).join(", ")} (got ${JSON.stringify(mode)}).`,
    )
    return
  }

  if (!Array.isArray(requirements) || requirements.length === 0) {
    errors.push(`${location}.requirements must be a non-empty array when mode is "exception".`)
    return
  }

  for (const requirement of requirements) {
    if (!VALID_REQUIREMENTS.includes(requirement as SuppressionRequirement)) {
      errors.push(
        `${location}.requirements contains an invalid entry (got ${JSON.stringify(requirement)}); ` +
          `expected one of ${VALID_REQUIREMENTS.map((r) => `"${r}"`).join(", ")}.`,
      )
    }
  }
}

/**
 * Every `SuppressionPolicy` value declared in `policyConfig` -- each domain's `default` and every
 * entry in its `rules` -- must be well-formed; this is a *configuration* bug (distinct from a
 * registry-data problem the policy evaluates records against) and is reported once, up front,
 * rather than discovered lazily per-record.
 * @param policyConfig - The suppression policy configuration to validate.
 * @returns One error message per invalid policy value found; empty if the config is valid.
 */
function validatePolicyConfig(policyConfig: SuppressionPolicyConfig): string[] {
  const errors: string[] = []

  for (const [domain, domainPolicy] of Object.entries(policyConfig)) {
    if (domainPolicy.default !== undefined) {
      validateSuppressionPolicyValue(
        domainPolicy.default,
        `suppressionPolicy.${domain}.default`,
        errors,
      )
    }
    for (const [pattern, policy] of Object.entries(domainPolicy.rules ?? {})) {
      // A literal "*" rules key is always a mistake, never an intentional blanket policy: Stryker's
      // own "disable every mutator" directive is spelled "all" (see policy-config.ts's own comment
      // on its `stryker.rules.all` entry), so "*" only ever reaches here as a glob pattern -- and
      // resolve-policy.ts's minimatch-based pattern matching would then match "*" against every
      // real rule name in the domain, silently forbidding (or allowing) far more than intended.
      if (pattern === "*") {
        errors.push(
          `suppressionPolicy.${domain}.rules must not use the literal "*" as a key -- ` +
            "it would glob-match every rule name in this domain via resolve-policy.ts's pattern " +
            'matching, which is almost never the intended scope. Use "all" for Stryker\'s own ' +
            "literal directive, or a more specific pattern.",
        )
      }
      validateSuppressionPolicyValue(
        policy,
        `suppressionPolicy.${domain}.rules["${pattern}"]`,
        errors,
      )
    }
  }

  return errors
}

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

  const configErrors = validatePolicyConfig(policyConfig)
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
