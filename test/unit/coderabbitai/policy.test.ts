import { describe, expect, it } from "vitest"
import { evaluateCoderabbitPolicy } from "../../../checks/coderabbitai.js"
import type {
  CoderabbitEvidence,
  NormalizedFinding,
} from "../../../scripts/coderabbitai/evidence-types.js"
import type { CoderabbitExceptionRecord } from "../../../scripts/coderabbitai/registry.js"
import { hashRequirementFields } from "../../../src/helpers/index.js"

const PROSE_REQUIREMENTS = ["justification", "remediation", "exceptionType"]

function fieldValue(record: CoderabbitExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

function finding(overrides: Partial<NormalizedFinding> = {}): NormalizedFinding {
  return {
    file: "src/example.ts",
    severity: "major",
    summary: "A finding CodeRabbit reported.",
    identity: "src/example.ts:major",
    ...overrides,
  }
}

function record(overrides: Partial<CoderabbitExceptionRecord> = {}): CoderabbitExceptionRecord {
  return {
    id: "src/example.ts:major",
    version: 1,
    file: "src/example.ts",
    severity: "major",
    justification: "",
    remediation: "",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

function verifiedRecord(
  overrides: Partial<CoderabbitExceptionRecord> = {},
): CoderabbitExceptionRecord {
  const base = record({
    justification: "The suggested change would regress a documented invariant.",
    remediation: "Tracked as a follow-up; not blocking.",
    ...overrides,
  })
  const hash = hashRequirementFields(base, PROSE_REQUIREMENTS, fieldValue)
  return {
    ...base,
    verification: {
      method: "independent-human-review",
      verifiedBy: "a-maintainer",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      verifiedContentHash: hash,
    },
  }
}

describe("evaluateCoderabbitPolicy", () => {
  it("warns when the review is not-applicable (CI), naming the expected provider", async () => {
    const evidence: CoderabbitEvidence = {
      status: "not-applicable",
      reason: "ci",
      expectedProvider: "coderabbit-github-app",
    }
    const result = await evaluateCoderabbitPolicy({ evidence })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("coderabbit-github-app")
  })

  it("warns (never fails or silently passes) when the CLI isn't installed", async () => {
    const evidence: CoderabbitEvidence = { status: "unavailable", reason: "cli-not-installed" }
    const result = await evaluateCoderabbitPolicy({ evidence })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("cli-not-installed")
  })

  it("warns on a detached-HEAD / unresolvable git context", async () => {
    const evidence: CoderabbitEvidence = {
      status: "unavailable",
      reason: "git-context-unavailable",
    }
    const result = await evaluateCoderabbitPolicy({ evidence })
    expect(result.outcome).toBe("warn")
  })

  it("fails on a malformed event stream or a real CLI-reported error", async () => {
    const evidence: CoderabbitEvidence = { status: "error", message: "unexpected shape" }
    const result = await evaluateCoderabbitPolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unexpected shape")
  })

  it("passes when the review reports 0 findings", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [] }
    const result = await evaluateCoderabbitPolicy({ evidence })
    expect(result.outcome).toBe("pass")
  })

  it("fails a finding with no matching exception record", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [finding()] }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("no matching exception record")
  })

  it("passes a finding with a fully verified, matching exception record", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [finding()] }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [verifiedRecord()] }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("stages the rationale to omit verification.verifiedBy while authoring fields are still missing", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [finding()] }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [record()] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("verification.verifiedBy")
    expect(result.rationale).toContain("justification")
  })

  it("reverts a verified record to insufficient once its verified content is edited (content-bound staleness)", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [finding()] }
    const edited = { ...verifiedRecord(), justification: "Edited after verification." }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [edited] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("verification.verifiedBy")
  })

  it("includes the finding's own summary text in the failure rationale", async () => {
    const evidence: CoderabbitEvidence = {
      status: "reviewed",
      findings: [finding({ summary: "A very specific description of the problem." })],
    }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.rationale).toContain("A very specific description of the problem.")
  })

  it("fails when the exceptions registry itself fails validation", async () => {
    const evidence: CoderabbitEvidence = { status: "reviewed", findings: [finding()] }
    const result = await evaluateCoderabbitPolicy({
      evidence,
      loadRegistry: async () => ({ ok: false, errors: ["exceptions[0].id is malformed"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed validation")
  })
})
