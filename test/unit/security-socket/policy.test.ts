import { describe, expect, it } from "vitest"
import { evaluateSecuritySocketPolicy } from "../../../checks/security-socket.js"
import type {
  NormalizedSocketAlert,
  SecuritySocketEvidence,
  SocketExceptionRecord,
} from "../../../scripts/security-socket/evidence-types.js"
import {
  createSocketStub,
  deriveSocketExceptionId,
} from "../../../scripts/security-socket/registry.js"

function alert(overrides: Partial<NormalizedSocketAlert> = {}): NormalizedSocketAlert {
  const base = {
    package: "lodash",
    version: "4.17.20",
    type: "envVars",
    severity: "low" as NormalizedSocketAlert["severity"],
    ...overrides,
  }
  return { ...base, id: deriveSocketExceptionId({ ...base, packageVersion: base.version }) }
}

const COMPLETE = {
  justification: "Needed for a documented build step.",
  alternatives: "No alternative package covers this use case.",
  remediation: "Upstream has been notified.",
  method: "independent-human-review" as const,
  exceptionType: "accepted-risk" as const,
}

function record(
  from: NormalizedSocketAlert,
  overrides: Partial<SocketExceptionRecord> = {},
): SocketExceptionRecord {
  return { ...createSocketStub(from, from.id), ...overrides }
}

interface Pair {
  readonly alert: NormalizedSocketAlert
  readonly record: SocketExceptionRecord
}

function failedEvidence(
  pairs: readonly Pair[],
  extras: {
    readonly stale?: readonly SocketExceptionRecord[]
    readonly registryError?: readonly string[]
  } = {},
): SecuritySocketEvidence {
  const activeExceptions: Record<string, SocketExceptionRecord> = {}
  for (const { alert: a, record: r } of pairs) activeExceptions[a.id] = r
  return {
    status: pairs.length > 0 ? "failed" : "passed",
    registryPath: ".repo-contract/exceptions/socket.json",
    alerts: pairs.map((p) => p.alert),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: [],
    ...(extras.registryError !== undefined ? { registryError: extras.registryError } : {}),
  }
}

describe("evaluateSecuritySocketPolicy", () => {
  it("warns (never fails) when the scan did not run", () => {
    const result = evaluateSecuritySocketPolicy({
      evidence: {
        status: "unavailable",
        reason: "not-authenticated",
        registryPath: ".repo-contract/exceptions/socket.json",
        existingRecordCount: 0,
      },
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("not-authenticated")
  })

  it("fails an unavailable run when the registry is malformed (registryError)", () => {
    const result = evaluateSecuritySocketPolicy({
      evidence: {
        status: "unavailable",
        reason: "not-authenticated",
        registryPath: ".repo-contract/exceptions/socket.json",
        existingRecordCount: 0,
        registryError: ["exceptions[0].id is malformed"],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load or reconcile")
  })

  it("fails on a malformed report", () => {
    const result = evaluateSecuritySocketPolicy({
      evidence: {
        status: "error",
        message: "unexpected shape",
        registryPath: ".repo-contract/exceptions/socket.json",
        existingRecordCount: 0,
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unexpected shape")
  })

  it("passes a clean scan with an empty registry", () => {
    const result = evaluateSecuritySocketPolicy({ evidence: failedEvidence([]) })
    expect(result.outcome).toBe("pass")
  })

  it("fails a critical alert outright even with a complete record", () => {
    const a = alert({ severity: "critical", package: "x", version: "1.0.0", type: "shellAccess" })
    const result = evaluateSecuritySocketPolicy({
      evidence: failedEvidence([{ alert: a, record: record(a, COMPLETE) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("fails a middle alert backed only by a blank stub", () => {
    const a = alert({ severity: "middle", package: "y", version: "2.0.0" })
    const result = evaluateSecuritySocketPolicy({
      evidence: failedEvidence([{ alert: a, record: record(a) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing:")
  })

  it("passes a low alert with a complete matching record", () => {
    const a = alert()
    const result = evaluateSecuritySocketPolicy({
      evidence: failedEvidence([{ alert: a, record: record(a, COMPLETE) }]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("a low alert needs justification + method + exceptionType (not alternatives/remediation)", () => {
    const a = alert()
    const result = evaluateSecuritySocketPolicy({
      evidence: failedEvidence([
        {
          alert: a,
          record: record(a, { justification: "Because.", exceptionType: "accepted-risk" }),
        },
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: method")
    expect(result.rationale).not.toContain("alternatives")
  })

  it("fails on a stale exception record whose alert is gone", () => {
    const gone = alert({ package: "left-pad", version: "1.3.0", type: "shellAccess" })
    const result = evaluateSecuritySocketPolicy({
      evidence: failedEvidence([], { stale: [record(gone, COMPLETE)] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale exception")
    expect(result.rationale).toContain(gone.id)
  })

  it("fails on a broken alerts <-> activeExceptions bijection", () => {
    const a = alert()
    const result = evaluateSecuritySocketPolicy({
      evidence: {
        status: "failed",
        registryPath: ".repo-contract/exceptions/socket.json",
        alerts: [a],
        activeExceptions: {},
        staleExceptions: [],
        scaffoldedIds: [],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("bijection")
  })
})
