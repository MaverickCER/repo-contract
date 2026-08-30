import { minimatch } from "minimatch"
import type { SuppressionGovernanceRecordEvidence } from "./evidence-types.js"
import type {
  SuppressionDomainPolicy,
  SuppressionPolicy,
  SuppressionPolicyConfig,
  SuppressionRequirement,
} from "./policy-config.js"
import { GLOBAL_DEFAULT_POLICY } from "./policy-config.js"

/**
 * Pure `(domain, rule)` -> policy resolution, shared by every consumer that needs to judge whether a
 * `disable-comments.json` record is adequately justified against `suppressionPolicy` --
 * `checks/suppression-governance.ts` (the registry's own governing check) and `checks/mutation.ts`
 * (which cross-checks Stryker-domain records before trusting a comment-ignored mutant) both import
 * from here rather than each keeping its own copy, so a future policy change (e.g. a new rule under
 * `stryker.rules`) can't drift between the two.
 */

const REQUIREMENT_ORDER: readonly SuppressionRequirement[] = [
  "justification",
  "alternatives",
  "remediation",
  "category",
  "verificationMethod",
  "reason",
]

/**
 * The stricter of two policies: `"forbidden"` always wins outright; between two non-forbidding
 * policies, the union of their required fields wins (an `"allowed"` policy contributes no
 * requirements, so merging it with an `"exception"` policy just yields that same exception
 * unchanged) -- satisfying the union trivially satisfies each individual input policy too, the
 * same guarantee `Math.max` gave the numeric requirement model this replaced. Reused for two
 * distinct combinations below: multiple wildcard patterns matching the same rule, and multiple
 * rules on the same suppression record.
 * @param a - One resolved policy.
 * @param b - The other resolved policy.
 * @returns The stricter of `a` and `b`.
 */
function stricterOf(a: SuppressionPolicy, b: SuppressionPolicy): SuppressionPolicy {
  if (a.mode === "forbidden" || b.mode === "forbidden") return { mode: "forbidden" }

  const aRequirements = a.mode === "exception" ? a.requirements : []
  const bRequirements = b.mode === "exception" ? b.requirements : []

  if (aRequirements.length === 0 && bRequirements.length === 0) return { mode: "allowed" }

  return {
    mode: "exception",
    requirements: REQUIREMENT_ORDER.filter(
      (requirement) => aRequirements.includes(requirement) || bRequirements.includes(requirement),
    ),
  }
}

/**
 * Resolves the policy a single `(domain, rule)` pair is subject to, in strict precedence order --
 * documented here as this function's one authoritative source of truth for that order:
 *
 * 0. **Blanket suppression** -- `rule === "*"` (see `eslintRecognizer`'s bare-disable case in
 *    recognizers.ts) means every rule in this domain was suppressed at once, not one specific rule
 *    named `"*"`. It is therefore resolved as the strictest (`stricterOf`) policy across every rule
 *    this domain could ever apply to any individual suppression -- every entry in
 *    `domainPolicy.rules` plus the domain default -- never via `minimatch`: `minimatch("*", pattern)`
 *    tests the literal one-character string `"*"` as a path against `pattern`, which does not
 *    glob-match a pattern like `"security/*"` (that would require the *pattern*, not the *target*, to
 *    be `"*"`), so treating this case as an ordinary pattern match would silently let a blanket
 *    disable fall through a domain's `forbidden` rules into its far more lenient default.
 * 1. **Exact match** -- `domainPolicy.rules[rule]`, if present. A pattern is never even consulted
 *    once an exact entry exists for `rule`.
 * 2. **Pattern match** -- the strictest (`stricterOf`) policy among every key in
 *    `domainPolicy.rules` that is not an exact match for `rule` but does match it as a `minimatch`
 *    glob (e.g. `"security/*"` matching `"security/detect-object-injection"`).
 * 3. **Domain default** -- `domainPolicy.default`, if the domain has an entry in `policyConfig` at
 *    all (whether or not that entry defines its own `default`).
 * 4. **Global default** -- `GLOBAL_DEFAULT_POLICY`, used only when `domain` itself has no entry in
 *    `policyConfig`.
 *
 * Assumes `policyConfig` has already passed `checks/suppression-governance.ts`'s `validatePolicyConfig`.
 * @param domain - The suppression's domain, e.g. `"eslint"`.
 * @param rule - One rule (or policy-addressable suppression identifier) to resolve a policy for.
 * @param policyConfig - The suppression policy configuration to resolve against.
 * @returns The resolved policy for `(domain, rule)`.
 */
function resolveRequirement(
  domain: string,
  rule: string,
  policyConfig: SuppressionPolicyConfig,
): SuppressionPolicy {
  const domainPolicy: SuppressionDomainPolicy | undefined = policyConfig[domain]
  if (domainPolicy === undefined) return GLOBAL_DEFAULT_POLICY

  const rules = Object.entries(domainPolicy.rules ?? {})

  if (rule === "*") {
    const everyPolicy = [
      ...rules.map(([, policy]) => policy),
      domainPolicy.default ?? GLOBAL_DEFAULT_POLICY,
    ]
    return everyPolicy.reduce(stricterOf)
  }

  const exactMatch = rules.find(([pattern]) => pattern === rule)
  if (exactMatch) return exactMatch[1]

  const matchingPolicies = rules
    .filter(([pattern]) => minimatch(rule, pattern))
    .map(([, policy]) => policy)
  if (matchingPolicies.length > 0) {
    return matchingPolicies.reduce(stricterOf)
  }

  return domainPolicy.default ?? GLOBAL_DEFAULT_POLICY
}

type SuppressionRecordVerdict = "forbidden" | "insufficient" | "permitted"

interface SuppressionRecordDeterminant {
  readonly record: SuppressionGovernanceRecordEvidence
  readonly verdict: SuppressionRecordVerdict
  readonly missing: readonly SuppressionRequirement[]
}

/**
 *
 * @param record SuppressionGovernanceRecordEvidence
 * @param requirement SuppressionRequirement
 * @returns string
 */
function fieldValue(
  record: SuppressionGovernanceRecordEvidence,
  requirement: SuppressionRequirement,
): string {
  return record[requirement] || ""
}

/**
 * Evaluates one registry record's every `rule` against `policyConfig`, taking the strictest
 * (`stricterOf`) of the per-rule resolved policies -- a record naming both a forbidden rule and an
 * otherwise-fine rule is forbidden overall. A required field only counts as satisfied once it's a
 * non-empty (post-trim) string -- an empty `justification`/`alternatives`/`remediation` is
 * registry-valid but policy-insufficient, exactly as `"exception"` mode's name implies.
 * @param record - The registry record to evaluate.
 * @param policyConfig - The suppression policy configuration to evaluate against.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 */
export function evaluateRecord(
  record: SuppressionGovernanceRecordEvidence,
  policyConfig: SuppressionPolicyConfig,
): SuppressionRecordDeterminant {
  const resolvedPolicy = record.rule
    .map((rule) => resolveRequirement(record.domain, rule, policyConfig))
    .reduce(stricterOf)

  if (resolvedPolicy.mode === "forbidden") {
    return { record, verdict: "forbidden", missing: [] }
  }

  const requirements = resolvedPolicy.mode === "exception" ? resolvedPolicy.requirements : []
  const missing = requirements.filter(
    (requirement) => fieldValue(record, requirement).trim().length === 0,
  )

  return { record, verdict: missing.length === 0 ? "permitted" : "insufficient", missing }
}

/**
 * A one-line, actionable identification of a record -- its file, line, domain, rule(s), and content.
 * @param record - The record to describe.
 * @returns A one-line description of `record`.
 */
export function describeRecord(record: SuppressionGovernanceRecordEvidence): string {
  return `${record.file}:${String(record.line)} [${record.domain}: ${record.rule.join(", ")}] "${record.content}"`
}

/**
 * Renders one non-permitted record's determinant as a rationale line.
 * @param determinant - The record's evaluated verdict and (if insufficient) missing fields.
 * @returns A one-line, actionable description of why `determinant.record` failed policy.
 */
export function formatOffender(determinant: SuppressionRecordDeterminant): string {
  const { record, verdict, missing } = determinant

  if (verdict === "forbidden") {
    return `${describeRecord(record)} -- forbidden by policy.`
  }
  return `${describeRecord(record)} -- insufficient justification (missing: ${missing.join(", ")}).`
}
