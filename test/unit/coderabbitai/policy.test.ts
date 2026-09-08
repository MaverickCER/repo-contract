import { describe, expect, it } from "vitest"
import { evaluateCoderabbitPolicy } from "../../../checks/coderabbitai.js"
import type {
  CoderabbitEvidence,
  CoderabbitExceptionRecord,
  NormalizedFinding,
} from "../../../scripts/coderabbitai/evidence-types.js"
import {
  createCoderabbitStub,
  deriveCoderabbitExceptionId,
} from "../../../scripts/coderabbitai/registry.js"

function finding(overrides: Partial<NormalizedFinding> = {}): NormalizedFinding {
  const base = {
    file: "src/example.ts",
    severity: "major" as NormalizedFinding["severity"],
    summary: "A finding CodeRabbit reported.",
    ...overrides,
  }
  return { ...base, id: deriveCoderabbitExceptionId(base) }
}

const COMPLETE = {
  justification: "The suggested change would regress a documented invariant.",
  remediation: "Tracked as a follow-up; not blocking.",
  method: "independent-human-review" as const,
  exceptionType: "accepted-risk" as const,
}

function record(
  from: NormalizedFinding,
  overrides: Partial<CoderabbitExceptionRecord> = {},
): CoderabbitExceptionRecord {
  return { ...createCoderabbitStub(from, from.id), ...overrides }
}

interface Pair {
  readonly finding: NormalizedFinding
  readonly record: CoderabbitExceptionRecord
}

function reviewed(
  pairs: readonly Pair[],
  extras: {
    readonly stale?: readonly CoderabbitExceptionRecord[]
    readonly registryError?: readonly string[]
  } = {},
): CoderabbitEvidence {
  const activeExceptions: Record<string, CoderabbitExceptionRecord> = {}
  for (const { finding: f, record: r } of pairs) activeExceptions[f.id] = r
  return {
    status: "reviewed",
    registryPath: ".repo-contract/exceptions/coderabbit.json",
    findings: pairs.map((p) => p.finding),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: [],
    ...(extras.registryError !== undefined ? { registryError: extras.registryError } : {}),
  }
}

const NOT_APPLICABLE: CoderabbitEvidence = {
  status: "not-applicable",
  reason: "ci",
  expectedProvider: "coderabbit-github-app",
  registryPath: ".repo-contract/exceptions/coderabbit.json",
  existingRecordCount: 0,
}

describe("evaluateCoderabbitPolicy", () => {
  it("warns when the review is not-applicable (CI), naming the expected provider", () => {
    const result = evaluateCoderabbitPolicy({ evidence: NOT_APPLICABLE })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("coderabbit-github-app")
  })

  it("warns when the CLI isn't installed", () => {
    const result = evaluateCoderabbitPolicy({
      evidence: {
        status: "unavailable",
        reason: "cli-not-installed",
        registryPath: ".repo-contract/exceptions/coderabbit.json",
        existingRecordCount: 0,
      },
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("cli-not-installed")
  })

  it("fails a not-applicable run when the registry is malformed (registryError)", () => {
    const result = evaluateCoderabbitPolicy({
      evidence: { ...NOT_APPLICABLE, registryError: ["exceptions[0] is broken"] },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load or reconcile")
  })

  it("notes present-but-unreconciled records on a not-applicable run", () => {
    const result = evaluateCoderabbitPolicy({
      evidence: { ...NOT_APPLICABLE, existingRecordCount: 2 },
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("were validated but not reconciled")
  })

  it("fails on a real CLI-reported error", () => {
    const result = evaluateCoderabbitPolicy({
      evidence: {
        status: "error",
        message: "unexpected shape",
        registryPath: ".repo-contract/exceptions/coderabbit.json",
        existingRecordCount: 0,
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unexpected shape")
  })

  it("passes a 0-findings review with an empty registry", () => {
    const result = evaluateCoderabbitPolicy({ evidence: reviewed([]) })
    expect(result.outcome).toBe("pass")
  })

  it("fails a 0-findings review with a stale record", () => {
    const gone = finding({ file: "src/gone.ts" })
    const result = evaluateCoderabbitPolicy({
      evidence: reviewed([], { stale: [record(gone, COMPLETE)] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale exception")
    expect(result.rationale).toContain(gone.id)
  })

  it("fails a finding backed only by a blank stub", () => {
    const f = finding()
    const result = evaluateCoderabbitPolicy({
      evidence: reviewed([{ finding: f, record: record(f) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing:")
  })

  it("passes a finding with a complete matching record", () => {
    const f = finding()
    const result = evaluateCoderabbitPolicy({
      evidence: reviewed([{ finding: f, record: record(f, COMPLETE) }]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("includes the finding's own summary text in the failure rationale", () => {
    const f = finding({ summary: "A very specific description of the problem." })
    const result = evaluateCoderabbitPolicy({
      evidence: reviewed([{ finding: f, record: record(f) }]),
    })
    expect(result.rationale).toContain("A very specific description of the problem.")
  })

  it("fails on a broken findings <-> activeExceptions bijection", () => {
    const f = finding()
    const result = evaluateCoderabbitPolicy({
      evidence: {
        status: "reviewed",
        registryPath: ".repo-contract/exceptions/coderabbit.json",
        findings: [f],
        activeExceptions: {},
        staleExceptions: [],
        scaffoldedIds: [],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("bijection")
  })
})
