import { describe, expect, it } from "vitest"
import { evaluateSuppressionGovernancePolicy } from "../../../checks/suppression-governance.js"
import {
  createSuppressionStub,
  deriveSuppressionId,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
  SuppressionGovernanceEvidence,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type { SuppressionPolicyConfig } from "../../../scripts/suppression-governance/policy-config.js"
import { suppressionPolicy } from "../../../scripts/suppression-governance/policy-config.js"

function finding(overrides: Partial<SuppressionFinding> = {}): SuppressionFinding {
  const base = {
    domain: "eslint",
    rule: ["no-console"],
    file: "src/example.ts",
    line: 42,
    content: "eslint-disable-next-line no-console",
    reason: "",
    ...overrides,
  }
  return { ...base, id: deriveSuppressionId(base) }
}

function record(
  from: SuppressionFinding,
  overrides: Partial<SuppressionExceptionRecord> = {},
): SuppressionExceptionRecord {
  return { ...createSuppressionStub(from, from.id), ...overrides }
}

interface Pair {
  readonly finding: SuppressionFinding
  readonly record: SuppressionExceptionRecord
}

function evidenceFor(
  pairs: readonly Pair[],
  extras: {
    readonly stale?: readonly SuppressionExceptionRecord[]
    readonly scaffolded?: readonly string[]
  } = {},
): SuppressionGovernanceEvidence {
  const activeExceptions: Record<string, SuppressionExceptionRecord> = {}
  for (const { finding: f, record: r } of pairs) activeExceptions[f.id] = r
  return {
    ok: true,
    registryPath: ".repo-contract/exceptions/disable-comments.json",
    findings: pairs.map((pair) => pair.finding),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: extras.scaffolded ?? [],
  }
}

const FULLY_JUSTIFIED = {
  justification:
    "Why this guardrail is deliberately bypassed; alternatives considered; finding confirmed real.",
  category: "equivalent-mutant",
  verificationMethod: "mutation-run",
} as const

function justifiedPair(overrides: Partial<SuppressionFinding> = {}): Pair {
  const f = finding(overrides)
  return { finding: f, record: record(f, FULLY_JUSTIFIED) }
}

describe("evaluateSuppressionGovernancePolicy", () => {
  it("fails immediately when the check's own evidence is ok: false (tool-infrastructure failure)", () => {
    const result = evaluateSuppressionGovernancePolicy({
      evidence: {
        ok: false,
        error:
          ".repo-contract/exceptions/disable-comments.json failed to load and was left unchanged.",
        registryValidationErrors: ["exceptions[0].line must be a positive integer (got 0)."],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load")
    expect(result.rationale).toContain("must be a positive integer")
  })

  it("passes with a summary rationale when there are no suppressions", () => {
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([]) })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 suppression(s) tracked")
  })

  it('rejects a literal "*" rules key as misconfiguration', () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "*": { mode: "forbidden" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([]), policyConfig })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('must not use the literal "*"')
  })

  it("'forbidden' mode forbids a suppression regardless of how fully it's justified", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "forbidden" } } },
    }
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([justifiedPair()]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("'allowed' mode permits a suppression with every justification field empty", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "allowed" } } },
    }
    const f = finding()
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f) }]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("'exception' mode rejects a record missing any required field, naming only the missing ones", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "no-console": {
            mode: "exception",
            requirements: ["justification", "verificationMethod"],
          },
        },
      },
    }
    const f = finding()
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, { justification: "Only this." }) }]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: verificationMethod")
    expect(result.rationale).not.toContain("missing: justification")
  })

  it("'exception' mode treats a whitespace-only field as still missing", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: { rules: { "no-console": { mode: "exception", requirements: ["justification"] } } },
    }
    const f = finding()
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, { justification: "   " }) }]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
  })

  it("registry validation and policy enforcement stay decoupled: an unclassified record is registry-valid, rejected by policy only once a config requires the classification", () => {
    const f = finding()

    const notRequired = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, { justification: "Because." }) }]),
      policyConfig: {
        eslint: { rules: { "no-console": { mode: "exception", requirements: ["justification"] } } },
      },
    })
    expect(notRequired.outcome).toBe("pass")

    const required = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, { justification: "Because." }) }]),
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

  it("defaults to the eslint domain default (all three record fields) when nothing else applies", () => {
    const f = finding({ domain: "eslint", rule: ["some-unlisted-rule"] })
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f) }]),
      policyConfig: {
        eslint: {
          default: {
            mode: "exception",
            requirements: ["justification", "category", "verificationMethod"],
          },
        },
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: justification, category, verificationMethod")
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
    const f = finding({ rule: ["security/detect-object-injection"] })
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f) }]),
      policyConfig,
    })
    expect(result.outcome).toBe("pass")
  })

  it("evaluates multiple rules on one suppression and takes the strictest (forbidding one forbids the whole)", () => {
    const policyConfig: SuppressionPolicyConfig = {
      eslint: {
        rules: {
          "security/*": { mode: "forbidden" },
          "other-rule": { mode: "exception", requirements: ["justification"] },
        },
      },
    }
    const f = finding({ rule: ["other-rule", "security/detect-object-injection"] })
    const result = evaluateSuppressionGovernancePolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, FULLY_JUSTIFIED) }]),
      policyConfig,
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("fails on a config-specific rationale when suppressionPolicy has an invalid mode", () => {
    const policyConfig = {
      eslint: { rules: { "no-console": { mode: "not-a-real-mode" } } },
    } as unknown as SuppressionPolicyConfig
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([]), policyConfig })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("misconfigured")
  })

  it("fails on a config naming an unrecognized requirement", () => {
    const policyConfig = {
      eslint: {
        rules: { "no-console": { mode: "exception", requirements: ["not-a-real-field"] } },
      },
    } as unknown as SuppressionPolicyConfig
    const result = evaluateSuppressionGovernancePolicy({ evidence: evidenceFor([]), policyConfig })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("misconfigured")
  })

  describe("stale exceptions", () => {
    it("fails naming a stale exception record whose finding is gone", () => {
      const gone = finding({ file: "src/deleted.ts", line: 9 })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([], { stale: [record(gone, FULLY_JUSTIFIED)] }),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("Stale exception")
      expect(result.rationale).toContain(gone.id)
      expect(result.rationale).toContain("delete this entry")
    })

    it("fails even when every live finding is fully justified, if any stale record remains", () => {
      const stale = finding({ file: "src/old.ts", line: 3 })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([justifiedPair()], { stale: [record(stale, FULLY_JUSTIFIED)] }),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("Stale exception")
    })
  })

  describe("scaffolded stubs", () => {
    it("fails a blank scaffolded stub for an 'exception'-mode finding and calls out the scaffolding", () => {
      const f = finding({ rule: ["@typescript-eslint/unbound-method"] })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([{ finding: f, record: record(f) }], { scaffolded: [f.id] }),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("Scaffolded 1 stub")
      expect(result.rationale).toContain("missing: justification")
    })
  })

  describe("bijection integrity", () => {
    it("fails when a finding has no active exception record", () => {
      const f = finding()
      const evidence: SuppressionGovernanceEvidence = {
        ok: true,
        registryPath: ".repo-contract/exceptions/disable-comments.json",
        findings: [f],
        activeExceptions: {},
        staleExceptions: [],
        scaffoldedIds: [],
      }
      const result = evaluateSuppressionGovernancePolicy({ evidence })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("bijection")
    })

    it("fails when an active exception matches no finding", () => {
      const f = finding()
      const evidence: SuppressionGovernanceEvidence = {
        ok: true,
        registryPath: ".repo-contract/exceptions/disable-comments.json",
        findings: [],
        activeExceptions: { [f.id]: record(f, FULLY_JUSTIFIED) },
        staleExceptions: [],
        scaffoldedIds: [],
      }
      const result = evaluateSuppressionGovernancePolicy({ evidence })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("bijection")
    })
  })

  describe("the real, committed suppressionPolicy", () => {
    it("forbids disabling 'all' Stryker mutators", () => {
      const f = finding({
        domain: "stryker",
        rule: ["all"],
        content: "Stryker disable all -- because",
        reason: "because",
      })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([{ finding: f, record: record(f, FULLY_JUSTIFIED) }]),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("forbidden by policy")
    })

    it("permits a specific mutator disable with every required field filled in", () => {
      const f = finding({
        domain: "stryker",
        rule: ["ConditionalExpression"],
        content: "Stryker disable next-line ConditionalExpression -- unreachable branch",
        reason: "unreachable branch",
      })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([{ finding: f, record: record(f, FULLY_JUSTIFIED) }]),
      })
      expect(result.outcome).toBe("pass")
    })

    it("rejects a Stryker record with prose but an unclassified ('') category", () => {
      const f = finding({
        domain: "stryker",
        rule: ["ConditionalExpression"],
        content: "Stryker disable next-line ConditionalExpression -- unreachable branch",
        reason: "unreachable branch",
      })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([
          { finding: f, record: record(f, { ...FULLY_JUSTIFIED, category: "" }) },
        ]),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("missing: category")
    })

    it("rejects a specific Stryker mutator disable with an empty reason even when otherwise fully justified", () => {
      const f = finding({
        domain: "stryker",
        rule: ["ConditionalExpression"],
        content: "Stryker disable next-line ConditionalExpression",
        reason: "",
      })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([{ finding: f, record: record(f, FULLY_JUSTIFIED) }]),
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("missing: reason")
    })

    it("is locked into the committed suppressionPolicy module (a rule with no specific entry falls to the eslint domain default)", () => {
      const f = finding({ rule: ["some-rule-with-no-specific-entry"] })
      const result = evaluateSuppressionGovernancePolicy({
        evidence: evidenceFor([{ finding: f, record: record(f) }]),
        policyConfig: suppressionPolicy,
      })
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("missing: justification, category, verificationMethod")
    })
  })
})
