import { minimatch } from "minimatch"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { evaluateFinding } from "../../scripts/suppression-governance/resolve-policy.js"
import { deriveSuppressionId } from "../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
} from "../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionDomainPolicy,
  SuppressionPolicy,
  SuppressionPolicyConfig,
  SuppressionRequirement,
} from "../../scripts/suppression-governance/policy-config.js"

/**
 * Differential property test: a frozen, self-contained re-implementation of the
 * forbidden/allowed/exception precedence + field-completeness algorithm
 * (specs/decisions/0006-suppression-governance.md), versus the real, finding-centric
 * `evaluateFinding` (which delegates to `repo-contract/helpers`'s classification-neutral
 * `evaluateExceptionRecord`/`resolveExceptionPolicy`). `verdict` must be identical for every
 * generated input; `missing` must be identical as a SET (its wire ORDER is allowed to differ --
 * the frozen impl canonicalizes via a fixed `REQUIREMENT_ORDER`; the generic core deliberately
 * has no such closed vocabulary; no consumer-facing contract ever promised a `missing` order).
 *
 * This proves the precedence rules survive the exception-registry unification
 * (specs/decisions/0013's "The exception registry is the review surface" amendment) intact,
 * across inputs the committed `suppressionPolicy`/`disable-comments.json` would never exercise.
 */

const REQUIREMENT_ORDER: readonly SuppressionRequirement[] = [
  "justification",
  "category",
  "verificationMethod",
  "reason",
]

const FROZEN_GLOBAL_DEFAULT_POLICY: SuppressionPolicy = {
  mode: "exception",
  requirements: ["justification", "category", "verificationMethod"],
}

function frozenStricterOf(a: SuppressionPolicy, b: SuppressionPolicy): SuppressionPolicy {
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

function frozenResolveRequirement(
  domain: string,
  rule: string,
  policyConfig: SuppressionPolicyConfig,
): SuppressionPolicy {
  const domainPolicy: SuppressionDomainPolicy | undefined = policyConfig[domain]
  if (domainPolicy === undefined) return FROZEN_GLOBAL_DEFAULT_POLICY

  const rules = Object.entries(domainPolicy.rules ?? {})

  if (rule === "*") {
    const everyPolicy = [
      ...rules.map(([, policy]) => policy),
      domainPolicy.default ?? FROZEN_GLOBAL_DEFAULT_POLICY,
    ]
    return everyPolicy.reduce(frozenStricterOf)
  }

  const exactMatch = rules.find(([pattern]) => pattern === rule)
  if (exactMatch) return exactMatch[1]

  const matchingPolicies = rules
    .filter(([pattern]) => minimatch(rule, pattern))
    .map(([, policy]) => policy)
  if (matchingPolicies.length > 0) {
    return matchingPolicies.reduce(frozenStricterOf)
  }

  return domainPolicy.default ?? FROZEN_GLOBAL_DEFAULT_POLICY
}

interface FrozenDeterminant {
  readonly verdict: "forbidden" | "insufficient" | "permitted"
  readonly missing: readonly string[]
}

function frozenEvaluate(
  finding: SuppressionFinding,
  record: SuppressionExceptionRecord,
  policyConfig: SuppressionPolicyConfig,
): FrozenDeterminant {
  const resolvedPolicy = finding.rule
    .map((rule) => frozenResolveRequirement(finding.domain, rule, policyConfig))
    .reduce(frozenStricterOf)

  if (resolvedPolicy.mode === "forbidden") {
    return { verdict: "forbidden", missing: [] }
  }

  const requirements = resolvedPolicy.mode === "exception" ? resolvedPolicy.requirements : []
  const values: Record<string, string> = {
    justification: record.justification,
    category: record.category,
    verificationMethod: record.verificationMethod,
    reason: finding.reason,
  }
  const missing = requirements.filter(
    (requirement) => (values[requirement] ?? "").trim().length === 0,
  )

  return { verdict: missing.length === 0 ? "permitted" : "insufficient", missing }
}

const DOMAINS = ["eslint", "stryker", "custom"] as const
const RULE_NAMES = ["rule-a", "rule-b", "security/x", "security/y", "other"] as const
const RULE_PATTERNS = ["rule-a", "security/*", "security/**", "other"] as const

const requirementsArbitrary = fc.uniqueArray(fc.constantFrom(...REQUIREMENT_ORDER), {
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

interface GeneratedPair {
  readonly finding: SuppressionFinding
  readonly record: SuppressionExceptionRecord
}

const pairArbitrary: fc.Arbitrary<GeneratedPair> = fc
  .record({
    domain: fc.constantFrom(...DOMAINS),
    rule: fc.uniqueArray(fc.constantFrom(...RULE_NAMES, "*"), { minLength: 1, maxLength: 3 }),
    justification: fieldValueArbitrary,
    category: fc.constantFrom<SuppressionExceptionRecord["category"]>("", "equivalent-mutant"),
    verificationMethod: fc.constantFrom<SuppressionExceptionRecord["verificationMethod"]>(
      "",
      "static-reasoning",
    ),
    reason: fieldValueArbitrary,
  })
  .map(({ domain, rule, justification, category, verificationMethod, reason }) => {
    const identity = { domain, rule, file: "src/example.ts", line: 1 }
    const id = deriveSuppressionId(identity)
    return {
      finding: { ...identity, id, content: "// disable", reason },
      record: {
        id,
        version: 1,
        justification,
        category,
        domain,
        file: "src/example.ts",
        line: 1,
        rule: [...rule],
        verificationMethod,
      },
    }
  })

describe("evaluateFinding -- differential property vs. a frozen precedence re-implementation", () => {
  it("agrees on verdict, and on missing as a set, for every generated (policyConfig, finding) pair", () => {
    fc.assert(
      fc.property(policyConfigArbitrary, pairArbitrary, (policyConfig, { finding, record }) => {
        const expected = frozenEvaluate(finding, record, policyConfig)
        const actual = evaluateFinding(finding, record, policyConfig)

        expect(actual.verdict).toBe(expected.verdict)
        expect([...actual.missing].sort()).toEqual([...expected.missing].sort())
      }),
      { numRuns: 500 },
    )
  })
})
