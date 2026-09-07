import { describe, expect, it } from "vitest"
import { evaluateSecuritySocketPolicy } from "../../../checks/security-socket.js"
import type { SecuritySocketEvidence } from "../../../scripts/security-socket/evidence-types.js"
import { VALID_SOCKET_REQUIREMENTS } from "../../../scripts/security-socket/policy-config.js"
import type { SocketExceptionRecord } from "../../../scripts/security-socket/registry.js"
import { hashRequirementFields } from "../../../src/helpers/index.js"

// Derived from the production constant, filtered exactly the way `checks/security-socket.ts`'s own
// `PROSE_REQUIREMENTS` is -- so a field added, dropped, or reordered in `VALID_SOCKET_REQUIREMENTS`
// can never silently desynchronize this fixture's `verifiedContentHash` from the check's.
const PROSE_REQUIREMENTS = VALID_SOCKET_REQUIREMENTS.filter(
  (field) => field !== "verification.verifiedBy",
)

function fieldValue(record: SocketExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

function record(overrides: Partial<SocketExceptionRecord> = {}): SocketExceptionRecord {
  return {
    id: "lodash@4.17.20:envVars",
    version: 1,
    package: "lodash",
    packageVersion: "4.17.20",
    alertType: "envVars",
    justification: "",
    alternatives: "",
    remediation: "",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

/** A record with every prose field filled in and a verification block whose hash matches. */
function verifiedRecord(overrides: Partial<SocketExceptionRecord> = {}): SocketExceptionRecord {
  const base = record({
    justification: "Needed for a documented build step.",
    alternatives: "No alternative package covers this use case.",
    remediation: "Upstream has been notified.",
    ...overrides,
  })
  const hash = hashRequirementFields(base, PROSE_REQUIREMENTS, fieldValue)
  return {
    ...base,
    verification: {
      method: "independent-human-review",
      verifiedBy: "security-team",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      verifiedContentHash: hash,
    },
  }
}

describe("evaluateSecuritySocketPolicy", () => {
  it("warns (never fails) when the scan did not run", async () => {
    const evidence: SecuritySocketEvidence = { status: "unavailable", reason: "not-authenticated" }
    const result = await evaluateSecuritySocketPolicy({ evidence })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("not-authenticated")
  })

  it("fails on a malformed/unrecognized report", async () => {
    const evidence: SecuritySocketEvidence = { status: "error", message: "unexpected shape" }
    const result = await evaluateSecuritySocketPolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unexpected shape")
  })

  it("passes on a clean scan", async () => {
    const evidence: SecuritySocketEvidence = { status: "passed" }
    const result = await evaluateSecuritySocketPolicy({ evidence })
    expect(result.outcome).toBe("pass")
  })

  it("fails a critical alert outright, with no exception able to permit it", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "x@1.0.0:shellAccess",
          package: "x",
          version: "1.0.0",
          type: "shellAccess",
          severity: "critical",
        },
      ],
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({
        ok: true,
        records: [
          verifiedRecord({
            id: "x@1.0.0:shellAccess",
            package: "x",
            packageVersion: "1.0.0",
            alertType: "shellAccess",
          }),
        ],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("fails a medium ('middle') alert with no matching exception record", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "y@2.0.0:envVars",
          package: "y",
          version: "2.0.0",
          type: "envVars",
          severity: "middle",
        },
      ],
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("no matching exception record")
  })

  it("passes a low-severity alert with a fully verified, matching exception record", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "lodash@4.17.20:envVars",
          package: "lodash",
          version: "4.17.20",
          type: "envVars",
          severity: "low",
        },
      ],
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [verifiedRecord()] }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails a matching-but-unverified record even with every prose field filled in, staging the rationale to only ask for authoring fields on the first pass", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "lodash@4.17.20:envVars",
          package: "lodash",
          version: "4.17.20",
          type: "envVars",
          severity: "low",
        },
      ],
    }
    const unverified = record({
      justification: "Filled in.",
      exceptionType: "accepted-risk",
    })
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [unverified] }),
    })
    expect(result.outcome).toBe("fail")
    // "low" requires justification + exceptionType (both filled) + verification -- staging hides
    // verification from the message only once every authoring field is filled; here it is, so
    // verification.verifiedBy is the one remaining, correctly surfaced entry.
    expect(result.rationale).toContain("verification.verifiedBy")
  })

  it("stages the rationale to omit verification.verifiedBy while authoring fields are still missing", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "lodash@4.17.20:envVars",
          package: "lodash",
          version: "4.17.20",
          type: "envVars",
          severity: "low",
        },
      ],
    }
    const freshlyDiscovered = record()
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [freshlyDiscovered] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("verification.verifiedBy")
    expect(result.rationale).toContain("justification")
  })

  it("reverts a verified record to insufficient once its verified content is edited (content-bound staleness)", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "lodash@4.17.20:envVars",
          package: "lodash",
          version: "4.17.20",
          type: "envVars",
          severity: "low",
        },
      ],
    }
    const verified = verifiedRecord()
    const edited = {
      ...verified,
      justification: "Edited after verification, invalidating the hash.",
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [edited] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("verification.verifiedBy")
  })

  it("still passes on a clean scan, but notes that present records went unevaluated", async () => {
    const evidence: SecuritySocketEvidence = { status: "passed" }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [verifiedRecord()] }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("were not evaluated")
  })

  it("fails a not-yet-authenticated (unavailable) run when the registry is malformed -- the registry is validated on every run", async () => {
    const evidence: SecuritySocketEvidence = { status: "unavailable", reason: "not-authenticated" }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: false, errors: ["exceptions[0].id is malformed"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed validation")
  })

  it("passes a failed scan whose only alert is permitted, naming a record that matched nothing (stale)", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [
        {
          id: "lodash@4.17.20:envVars",
          package: "lodash",
          version: "4.17.20",
          type: "envVars",
          severity: "low",
        },
      ],
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({
        ok: true,
        records: [
          verifiedRecord(),
          verifiedRecord({
            id: "left-pad@1.3.0:shellAccess",
            package: "left-pad",
            packageVersion: "1.3.0",
            alertType: "shellAccess",
          }),
        ],
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("left-pad@1.3.0:shellAccess")
    expect(result.rationale).toContain("matched nothing this run")
  })

  it("confirms the committed socketPolicy module passes validateExceptionPolicyConfig", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [{ id: "x@1.0.0:a", package: "x", version: "1.0.0", type: "a", severity: "low" }],
    }
    // socketPolicy is a fixed module constant -- the misconfiguration branch itself is exercised
    // directly in test/unit/helpers/exception-policy.test.ts. Here we only assert the real,
    // committed module is NOT itself misconfigured (no "misconfigured" text in the rationale).
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("misconfigured")
  })

  it("fails when the exceptions registry itself fails validation", async () => {
    const evidence: SecuritySocketEvidence = {
      status: "failed",
      alerts: [{ id: "x@1.0.0:a", package: "x", version: "1.0.0", type: "a", severity: "low" }],
    }
    const result = await evaluateSecuritySocketPolicy({
      evidence,
      loadRegistry: async () => ({ ok: false, errors: ["exceptions[0].id is malformed"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed validation")
  })
})
