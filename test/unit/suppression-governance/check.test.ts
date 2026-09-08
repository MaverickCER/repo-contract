import { describe, expect, it } from "vitest"
import {
  createSuppressionStub,
  deriveSuppressionId,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type { SuppressionFinding } from "../../../scripts/suppression-governance/evidence-types.js"

/**
 * Focused unit tests for the two identity/scaffolding primitives `check.ts` hands to
 * `reconcileExceptions`. The integration test
 * (test/integration/suppression-governance/check.integration.test.ts) proves the whole pipeline
 * end-to-end through a real disk round-trip; these exist so a regression here fails with a
 * precise, fast, isolated signal.
 */

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

describe("deriveSuppressionId", () => {
  it("composes <check>:<domain>:<rule.join(',')>:<file>:<line>", () => {
    expect(
      deriveSuppressionId({ domain: "eslint", rule: ["no-console"], file: "src/a.ts", line: 3 }),
    ).toBe("suppression:eslint:no-console:src/a.ts:3")
  })

  it("joins a multi-rule directive with commas, in source order", () => {
    expect(
      deriveSuppressionId({
        domain: "stryker",
        rule: ["ConditionalExpression", "EqualityOperator"],
        file: "src/b.ts",
        line: 10,
      }),
    ).toBe("suppression:stryker:ConditionalExpression,EqualityOperator:src/b.ts:10")
  })

  it("distinguishes two directives that differ only by line -- moving a directive changes its id", () => {
    const a = deriveSuppressionId({ domain: "eslint", rule: ["x"], file: "src/c.ts", line: 5 })
    const b = deriveSuppressionId({ domain: "eslint", rule: ["x"], file: "src/c.ts", line: 6 })
    expect(a).not.toBe(b)
  })
})

describe("createSuppressionStub", () => {
  it("returns a blank record carrying the canonical id and the finding's identity fields", () => {
    const f = finding({ domain: "stryker", rule: ["ArrayDeclaration"], line: 7, reason: "why" })
    const stub = createSuppressionStub(f, f.id)

    expect(stub).toEqual({
      id: f.id,
      version: 1,
      justification: "",
      category: "",
      domain: "stryker",
      file: "src/example.ts",
      line: 7,
      rule: ["ArrayDeclaration"],
      verificationMethod: "",
    })
  })

  it("copies the rule array rather than aliasing the finding's", () => {
    const f = finding()
    const stub = createSuppressionStub(f, f.id)
    expect(stub.rule).not.toBe(f.rule)
    expect(stub.rule).toEqual(f.rule)
  })
})
