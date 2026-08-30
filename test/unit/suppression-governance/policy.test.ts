import { describe, expect, it } from "vitest"
import { evaluateSuppressionGovernancePolicy } from "../../../checks/suppression-governance.js"
import type {
  SuppressionGovernanceEvidence,
  SuppressionGovernanceRecordEvidence,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type { SuppressionPolicyConfig } from "../../../scripts/suppression-governance/policy-config.js"

function record(
  overrides: Partial<SuppressionGovernanceRecordEvidence> = {},
): SuppressionGovernanceRecordEvidence {
  return {
    file: "src/example.ts",
    line: 42,
    domain: "eslint",
    rule: ["no-console"],
    content: "eslint-disable-next-line no-console",
    justification: "",
    alternatives: "",
    remediation: "",
    category: "",
    verificationMethod: "",
    reason: "",
    status: "existing",
    ...overrides,
  }
}

function evidenceFor(
  records: readonly SuppressionGovernanceRecordEvidence[],
): SuppressionGovernanceEvidence {
  return {
    ok: true,
    records,
    newCount: 0,
    movedCount: 0,
    removedCount: 0,
    registryPath: "disable-comments.json",
  }
}

const FULLY_JUSTIFIED = {
  justification: "Why this is the best option.",
  alternatives: "Another way this could be done.",
  remediation: "What was attempted, and why it wasn't enough.",
  category: "equivalent-mutant",
  verificationMethod: "mutation-run",
} as const

describe("evaluateSuppressionGovernancePolicy", () => {
  it("fails immediately when the check's own evidence is ok: false (tool-infrastructure failure)", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: { ok: false, error: "disable-comments.json failed validation." },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed validation")
  })

  it("passes with a summary rationale when there are no suppressions", () => {
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([]) })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 suppression(s) tracked")
  })

  it('rejects a literal "*" rules key as misconfiguration -- it would glob-match every rule name in the domain', () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "*": { mode: "forbidden" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('must not use the literal "*"')
  })

  it("'forbidden' mode forbids a suppression regardless of how fully it's justified", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "forbidden" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record(FULLY_JUSTIFIED)]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("'allowed' mode permits a suppression with every justification field empty", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "allowed" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record()]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("'exception' mode rejects a record missing any required field", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "no-console": { mode: "exception", requirements: ["justification", "remediation"] },
        },
      },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ justification: "Only this filled in." })]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: remediation")
    expect(result.rationale).not.toContain("missing: justification")
  })

  it("'exception' mode treats a whitespace-only field as still missing", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "exception", requirements: ["justification"] } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ justification: "   " })]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
  })

  it("registry validation and policy enforcement stay decoupled: a record with category/verificationMethod '' is registry-valid, and is rejected by policy only once a config actually requires them", () => {
    const unclassified = record({ category: "", verificationMethod: "" })

    const notRequired = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([unclassified]),
      policyConfig: {
        eslint: { rules: { "no-console": { mode: "exception", requirements: ["justification"] } } },
      },
    })
    expect(notRequired.outcome).toBe("fail")
    expect(notRequired.rationale).not.toContain("category")
    expect(notRequired.rationale).not.toContain("verificationMethod")

    const required = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ ...unclassified, justification: "Because." }]),
      policyConfig: {
        eslint: {
          rules: {
            "no-console": {
              mode: "exception",
              requirements: ["justification", "category", "verificationMethod"],
            },
          },
        },
      },
    })
    expect(required.outcome).toBe("fail")
    expect(required.rationale).toContain("missing: category, verificationMethod")
  })

  it("'exception' mode accepts a record with every required field non-empty", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "no-console": { mode: "exception", requirements: ["justification", "alternatives"] },
        },
      },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ justification: "Because.", alternatives: "Considered X." })]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("defaults to requiring all three fields when nothing else in the config applies", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ domain: "unlisted-domain", rule: ["whatever"] })]),
      policyConfig: {},
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: justification, alternatives, remediation")
  })

  it("an exact rule match takes precedence over a wildcard pattern", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "security/*": { mode: "forbidden" },
          "security/detect-object-injection": { mode: "allowed" },
        },
      },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ rule: ["security/detect-object-injection"] })]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("a wildcard pattern matches correctly", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "security/*": { mode: "forbidden" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ rule: ["security/detect-unsafe-regex"] })]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
  })

  it("uses the domain default when no exact or pattern rule matches", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { default: { mode: "exception", requirements: ["remediation"] } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ rule: ["unlisted-rule"], remediation: "Because." })]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("uses the global default (require all three fields) only when the domain itself has no entry in the config", () => {
    const policyConfig: SuppressionPolicyConfig = { typescript: { default: { mode: "allowed" } } }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ domain: "eslint" })]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: justification, alternatives, remediation")
  })

  it("evaluates multiple rules on one suppression and takes the strictest result (forbidding one forbids the whole suppression)", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "security/*": { mode: "forbidden" },
          "other-rule": { mode: "exception", requirements: ["justification"] },
        },
      },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({ rule: ["other-rule", "security/detect-object-injection"], ...FULLY_JUSTIFIED }),
      ]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("evaluates multiple rules with different exception requirements as the union of both", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "rule-a": { mode: "exception", requirements: ["justification"] },
          "rule-b": { mode: "exception", requirements: ["remediation"] },
        },
      },
    }
    const onlyJustification = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record({ rule: ["rule-a", "rule-b"], justification: "Because." })]),
      policyConfig,
    })
    expect(onlyJustification.outcome).toBe("fail")
    expect(onlyJustification.rationale).toContain("missing: remediation")

    const both = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({ rule: ["rule-a", "rule-b"], justification: "Because.", remediation: "Tried X." }),
      ]),
      policyConfig,
    })
    expect(both.outcome).toBe("pass")
  })

  it("a security wildcard forbids every security rule", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "security/*": { mode: "forbidden" } } },
    }
    const securityRules = [
      "security/detect-object-injection",
      "security/detect-unsafe-regex",
      "security/detect-non-literal-regexp",
    ]

    for (const rule of securityRules) {
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([record({ rule: [rule], ...FULLY_JUSTIFIED })]),
        policyConfig,
      })
      expect(result.outcome).toBe("fail")
    }
  })

  it("never invents justification content -- a record with every field empty is always evaluated against exactly what's on the record", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "exception", requirements: ["justification"] } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record()]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: justification")
  })

  it("fails with a config-specific rationale when suppressionPolicy itself has an invalid mode", () => {
    const policyConfig = {
      eslint: { rules: { "no-console": { mode: "not-a-real-mode" } } },
    } as unknown as SuppressionPolicyConfig
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record()]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("misconfigured")
  })

  it("fails with a config-specific rationale when an 'exception' policy has an empty requirements array", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "exception", requirements: [] } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record()]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("misconfigured")
  })

  it("fails with a config-specific rationale when an 'exception' policy names an unrecognized requirement", () => {
    const policyConfig = {
      eslint: {
        rules: { "no-console": { mode: "exception", requirements: ["not-a-real-field"] } },
      },
    } as unknown as SuppressionPolicyConfig
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([record()]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("misconfigured")
  })

  it("the real stryker policy forbids disabling 'all' mutators", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({ domain: "stryker", rule: ["all"], content: "Stryker disable all -- because" }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("the real stryker policy permits a specific mutator disable with every required field filled in", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({
          domain: "stryker",
          rule: ["ConditionalExpression"],
          content: "Stryker disable next-line ConditionalExpression -- unreachable branch",
          reason: "unreachable branch",
          ...FULLY_JUSTIFIED,
        }),
      ]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("the real stryker policy rejects a record with prose but an unclassified ('') category, naming it as missing", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({
          domain: "stryker",
          rule: ["ConditionalExpression"],
          content: "Stryker disable next-line ConditionalExpression -- unreachable branch",
          reason: "unreachable branch",
          ...FULLY_JUSTIFIED,
          category: "",
        }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: category")
  })

  it("the real stryker default now also requires justification, alternatives, and remediation, not just reason", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({
          domain: "stryker",
          rule: ["ConditionalExpression"],
          content: "Stryker disable next-line ConditionalExpression -- unreachable branch",
          reason: "unreachable branch",
        }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: justification, alternatives, remediation")
  })

  it("the real stryker policy rejects a specific mutator disable with an empty reason even when otherwise fully justified", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({
          domain: "stryker",
          rule: ["ConditionalExpression"],
          content: "Stryker disable next-line ConditionalExpression",
          reason: "",
          ...FULLY_JUSTIFIED,
        }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: reason")
  })

  it("the stryker 'all' forbidden entry does not glob-match a real mutator name (minimatch-collision regression)", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([
        record({
          domain: "stryker",
          rule: ["ConditionalExpression"],
          content: "Stryker disable next-line ConditionalExpression -- reason text",
          reason: "reason text",
          ...FULLY_JUSTIFIED,
        }),
      ]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("independently re-validates evidence.records and fails if the registry shape is invalid", () => {
    const invalidRecord = {
      ...record(),
      rule: [],
    } as unknown as SuppressionGovernanceRecordEvidence
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([invalidRecord]) })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("independent registry validation")
  })
})
