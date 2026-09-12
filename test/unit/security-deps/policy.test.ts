import { describe, expect, it } from "vitest"
import {
  createSecurityDepsStub,
  deriveSecurityDepsExceptionId,
  evaluateSecurityDepsPolicy,
} from "../../../checks/security-deps.js"
import type {
  NormalizedDepFinding,
  SecurityDepsEvidence,
  SecurityDepsExceptionRecord,
} from "../../../checks/security-deps.js"

function finding(overrides: Partial<NormalizedDepFinding> = {}): NormalizedDepFinding {
  const base = {
    package: "left-pad",
    range: "<=1.3.0",
    severity: "high" as NormalizedDepFinding["severity"],
    ...overrides,
  }
  return { ...base, id: deriveSecurityDepsExceptionId(base) }
}

const COMPLETE = {
  justification: "Real, tolerated risk.",
  alternatives: "No alternative package covers this use case.",
  remediation: "Revisit when a patch ships.",
  method: "independent-human-review" as const,
  exceptionType: "accepted-risk" as const,
}

function record(
  from: NormalizedDepFinding,
  overrides: Partial<SecurityDepsExceptionRecord> = {},
): SecurityDepsExceptionRecord {
  return { ...createSecurityDepsStub(from, from.id), ...overrides }
}

interface Pair {
  readonly finding: NormalizedDepFinding
  readonly record: SecurityDepsExceptionRecord
}

function evidence(
  pairs: readonly Pair[],
  extras: {
    readonly stale?: readonly SecurityDepsExceptionRecord[]
    readonly scaffolded?: readonly string[]
  } = {},
): SecurityDepsEvidence {
  const activeExceptions: Record<string, SecurityDepsExceptionRecord> = {}
  for (const { finding: f, record: r } of pairs) activeExceptions[f.id] = r
  return {
    findings: pairs.map((p) => p.finding),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: extras.scaffolded ?? [],
  }
}

describe("evaluateSecurityDepsPolicy", () => {
  it("passes a clean scan with an empty registry", () => {
    const result = evaluateSecurityDepsPolicy({ evidence: evidence([]) })
    expect(result).toEqual({
      outcome: "pass",
      rationale: "0 npm audit finding(s) evaluated: all permitted by a complete exception record.",
    })
  })

  it("fails a finding backed only by a blank stub, naming every missing field", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: f, record: record(f) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "exception incomplete (missing: justification, alternatives, remediation, method, exceptionType)",
    )
  })

  it("passes a finding with a complete matching record", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: f, record: record(f, COMPLETE) }]),
    })
    expect(result).toEqual({
      outcome: "pass",
      rationale: "1 npm audit finding(s) evaluated: all permitted by a complete exception record.",
    })
  })

  it("requires the full field set even for a critical-severity finding -- no severity-tiered forbidding", () => {
    const f = finding({ severity: "critical" })
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: f, record: record(f, COMPLETE) }]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails an incomplete record, listing exactly which fields are missing", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([
        { finding: f, record: record(f, { ...COMPLETE, alternatives: "", remediation: "" }) },
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("exception incomplete (missing: alternatives, remediation)")
  })

  it("fails on a stale exception record whose finding is gone", () => {
    const gone = finding({ package: "gone-package", range: "1.0.0" })
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([], { stale: [record(gone, COMPLETE)] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale exception")
    expect(result.rationale).toContain(gone.id)
    expect(result.rationale).toContain("npm audit no longer reports this vulnerability")
  })

  it("fails on a finding with no reconciled record at all (registry integrity failure)", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: { findings: [f], activeExceptions: {}, staleExceptions: [], scaffoldedIds: [] },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "no reconciled exception record (registry integrity failure)",
    )
  })

  it("notes how many new records were scaffolded blank, only when passing", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: f, record: record(f, COMPLETE) }], { scaffolded: [f.id] }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("1 new record(s) scaffolded blank")
  })

  it("omits the scaffolded-count suffix when nothing was newly scaffolded", () => {
    const f = finding()
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: f, record: record(f, COMPLETE) }]),
    })
    expect(result.rationale).not.toContain("scaffolded")
  })

  it("reports both an offender and a stale record together, counting both", () => {
    const bad = finding({ package: "bad", range: "1.0.0" })
    const gone = finding({ package: "gone-package", range: "1.0.0" })
    const result = evaluateSecurityDepsPolicy({
      evidence: evidence([{ finding: bad, record: record(bad) }], {
        stale: [record(gone, COMPLETE)],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 npm audit finding(s) or stale record(s) need attention:")
  })
})
