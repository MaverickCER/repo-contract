import { minimatch } from "minimatch"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { evaluateRecord } from "../../scripts/suppression-governance/resolve-policy.js"
import type {
  SuppressionGovernanceRecordEvidence,
  SuppressionRecordStatus,
} from "../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionDomainPolicy,
  SuppressionPolicy,
  SuppressionPolicyConfig,
  SuppressionRequirement,
} from "../../scripts/suppression-governance/policy-config.js"

/**
 * Differential property test: the pre-generalization `evaluateRecord` (frozen below, byte-for-byte
 * from the commit immediately before specs/decisions/0013-reusable-exception-policy-helper.md's
 * retrofit -- see `git show <that commit>:scripts/suppression-governance/resolve-policy.ts`) versus
 * the real, retrofitted `evaluateRecord` now imported from the actual module (which delegates to
 * `repo-contract/helpers`'s classification-neutral `evaluateExceptionRecord`/`resolveExceptionPolicy`).
 * `verdict` must be identical for every generated input; `missing` must be identical as a SET (its
 * on-the-wire ORDER is allowed to differ -- the old implementation canonicalizes via a fixed
 * `REQUIREMENT_ORDER`, a closed vocabulary the generic core deliberately does not have (see
 * `src/helpers/exception-policy.ts`'s own `stricterOf` doc comment); no consumer-facing contract
 * ever promised a specific `missing` order, only its membership).
 *
 * This is the test that actually proves specs/decisions/0006-suppression-governance.md's
 * forbidden/allowed/exception precedence rules survived the generalization intact, across inputs
 * this repository's own committed `suppressionPolicy`/`disable-comments.json` would never happen to
 * exercise (the real config's every exception policy already lists requirements in canonical order,
 * which would hide an ordering regression -- see this file's own git history for the analysis).
 */

const REQUIREMENT_ORDER: readonly SuppressionRequirement[] = [
  "justification",
  "alternatives",
  "remediation",
  "category",
  "verificationMethod",
  "reason",
  "verifiedBy",
]

const OLD_GLOBAL_DEFAULT_POLICY: SuppressionPolicy = {
  mode: "exception",
  requirements: [
    "justification",
    "alternatives",
    "remediation",
    "category",
    "verificationMethod",
    "verifiedBy",
  ],
}

function oldStricterOf(a: SuppressionPolicy, b: SuppressionPolicy): SuppressionPolicy {
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

function oldResolveRequirement(
  domain: string,
  rule: string,
  policyConfig: SuppressionPolicyConfig,
): SuppressionPolicy {
  const domainPolicy: SuppressionDomainPolicy | undefined = policyConfig[domain]
  if (domainPolicy === undefined) return OLD_GLOBAL_DEFAULT_POLICY

  const rules = Object.entries(domainPolicy.rules ?? {})

  if (rule === "*") {
    const everyPolicy = [
      ...rules.map(([, policy]) => policy),
      domainPolicy.default ?? OLD_GLOBAL_DEFAULT_POLICY,
    ]
    return everyPolicy.reduce(oldStricterOf)
  }

  const exactMatch = rules.find(([pattern]) => pattern === rule)
  if (exactMatch) return exactMatch[1]

  const matchingPolicies = rules
    .filter(([pattern]) => minimatch(rule, pattern))
    .map(([, policy]) => policy)
  if (matchingPolicies.length > 0) {
    return matchingPolicies.reduce(oldStricterOf)
  }

  return domainPolicy.default ?? OLD_GLOBAL_DEFAULT_POLICY
}

interface OldDeterminant {
  readonly verdict: "forbidden" | "insufficient" | "permitted"
  readonly missing: readonly string[]
}

// `requirement` is `string`, not `SuppressionRequirement`, for the same reason the real
// (retrofitted) resolve-policy.ts's own `fieldValue` now is: `SuppressionPolicy` is an alias of
// `repo-contract/helpers`'s classification-neutral `ExceptionPolicy`, whose `requirements` field is
// a plain `readonly string[]` -- the closed-set guarantee moved to a runtime check
// (`validateExceptionPolicyConfig`'s `validRequirements` argument), not the type. Every value this
// fixture ever calls it with is still drawn from `REQUIREMENT_NAMES` (below), so the cast is safe
// for this test's own generated inputs.
function oldFieldValue(record: SuppressionGovernanceRecordEvidence, requirement: string): string {
  return record[requirement as SuppressionRequirement] || ""
}

function oldEvaluateRecord(
  record: SuppressionGovernanceRecordEvidence,
  policyConfig: SuppressionPolicyConfig,
): OldDeterminant {
  const resolvedPolicy = record.rule
    .map((rule) => oldResolveRequirement(record.domain, rule, policyConfig))
    .reduce(oldStricterOf)

  if (resolvedPolicy.mode === "forbidden") {
    return { verdict: "forbidden", missing: [] }
  }

  const requirements = resolvedPolicy.mode === "exception" ? resolvedPolicy.requirements : []
  const missing = requirements.filter(
    (requirement) => oldFieldValue(record, requirement).trim().length === 0,
  )

  return { verdict: missing.length === 0 ? "permitted" : "insufficient", missing }
}

// A small, fixed vocabulary -- large enough to exercise exact match, glob match (via the
// "security/*"-shaped entries), multi-rule union, and "no match at all" (falling through to a
// domain/global default), without an unbounded state space fast-check would struggle to shrink
// usefully.
const DOMAINS = ["eslint", "stryker", "custom"] as const
const RULE_NAMES = ["rule-a", "rule-b", "security/x", "security/y", "other"] as const
const RULE_PATTERNS = ["rule-a", "security/*", "other"] as const
const REQUIREMENT_NAMES: readonly SuppressionRequirement[] = REQUIREMENT_ORDER

const requirementsArbitrary = fc.uniqueArray(fc.constantFrom(...REQUIREMENT_NAMES), {
  minLength: 1,
})

const policyArbitrary: fc.Arbitrary<SuppressionPolicy> = fc.oneof(
  fc.constant<SuppressionPolicy>({ mode: "forbidden" }),
  fc.constant<SuppressionPolicy>({ mode: "allowed" }),
  requirementsArbitrary.map((requirements): SuppressionPolicy => ({
    mode: "exception",
    requirements,
  })),
)

const domainPolicyArbitrary: fc.Arbitrary<SuppressionDomainPolicy> = fc.record(
  {
    default: fc.option(policyArbitrary, { nil: undefined }),
    rules: fc.option(
      fc.dictionary(fc.constantFrom(...RULE_PATTERNS), policyArbitrary, {
        maxKeys: RULE_PATTERNS.length,
      }),
      { nil: undefined },
    ),
  },
  { requiredKeys: [] },
)

const policyConfigArbitrary: fc.Arbitrary<SuppressionPolicyConfig> = fc.dictionary(
  fc.constantFrom(...DOMAINS),
  domainPolicyArbitrary,
  { maxKeys: DOMAINS.length },
)

const fieldValueArbitrary = fc.constantFrom("", "   ", "a reason", "another value entirely")

const recordArbitrary: fc.Arbitrary<SuppressionGovernanceRecordEvidence> = fc.record({
  file: fc.constant("src/example.ts"),
  line: fc.constant(1),
  domain: fc.constantFrom(...DOMAINS),
  rule: fc.uniqueArray(fc.constantFrom(...RULE_NAMES, "*"), { minLength: 1, maxLength: 3 }),
  content: fc.constant("// disable"),
  justification: fieldValueArbitrary,
  alternatives: fieldValueArbitrary,
  remediation: fieldValueArbitrary,
  // Closed enums (SuppressionCategory/VerificationMethod), unlike the free-prose fields above --
  // still exercising both "missing" (`""`) and "present" (a real member) for the requirement-
  // completeness logic, without needing arbitrary text these two fields' own type never admits.
  category: fc.constantFrom<SuppressionGovernanceRecordEvidence["category"]>(
    "",
    "equivalent-mutant",
  ),
  verificationMethod: fc.constantFrom<SuppressionGovernanceRecordEvidence["verificationMethod"]>(
    "",
    "static-reasoning",
  ),
  reason: fieldValueArbitrary,
  // The content-bound verification block, held at `""`. This differential test covers the
  // *precedence + field-completeness algorithm*; `verifiedBy` participates as a required field
  // (it is in `REQUIREMENT_ORDER` below), but with no `verifiedContentHash` it is unsigned by
  // definition, so the new content-bound `fieldValue` and the frozen old raw read agree without
  // this test needing to model hash-binding -- that has its own coverage in
  // test/unit/suppression-governance/policy.test.ts.
  verifiedBy: fc.constant(""),
  verifiedAt: fc.constant(""),
  verifiedContentHash: fc.constant(""),
  status: fc.constant<SuppressionRecordStatus>("existing"),
})

describe("evaluateRecord -- differential property vs. the pre-generalization implementation", () => {
  it("agrees on verdict, and on missing as a set, for every generated (policyConfig, record) pair", () => {
    fc.assert(
      fc.property(policyConfigArbitrary, recordArbitrary, (policyConfig, record) => {
        const expected = oldEvaluateRecord(record, policyConfig)
        const actual = evaluateRecord(record, policyConfig)

        expect(actual.verdict).toBe(expected.verdict)
        expect([...actual.missing].sort()).toEqual([...expected.missing].sort())
      }),
      { numRuns: 500 },
    )
  })
})
