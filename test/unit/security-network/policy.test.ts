import { describe, expect, it } from "vitest"
import { evaluateSecurityNetworkPolicy } from "../../../checks/security-network.js"
import type {
  NetworkCapabilityKind,
  NetworkScanEvidence,
} from "../../../scripts/security-network/evidence-types.js"
import type { NetworkExceptionRecord } from "../../../scripts/security-network/registry.js"
import { hashRequirementFields } from "../../../src/helpers/index.js"

const PROSE_REQUIREMENTS = ["justification", "alternatives", "remediation", "exceptionType"]

function fieldValue(record: NetworkExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

function evidence(overrides: Partial<NetworkScanEvidence> = {}): NetworkScanEvidence {
  return {
    filesScanned: 39,
    findings: [],
    ...overrides,
  }
}

const EVIL_HTTP = {
  file: "src/presets/evil.ts",
  line: 3,
  column: 8,
  capability: "restricted-module-import" as NetworkCapabilityKind,
  detail: 'Imports "node:http", which performs network I/O.',
}
const EVIL_CURL = {
  file: "src/presets/evil.ts",
  line: 10,
  column: 1,
  capability: "unreviewed-preset-command" as NetworkCapabilityKind,
  detail: 'Preset run command "curl" is not in the reviewed allowlist.',
}

function record(overrides: Partial<NetworkExceptionRecord> = {}): NetworkExceptionRecord {
  const base: NetworkExceptionRecord = {
    id: "restricted-module-import:src/presets/evil.ts:3",
    version: 1,
    capability: "restricted-module-import",
    file: "src/presets/evil.ts",
    line: 3,
    justification: "",
    alternatives: "",
    remediation: "",
    exceptionType: "accepted-risk",
    ...overrides,
  }
  return base
}

/** A record with every prose field filled in and a verification block whose hash matches. */
function verifiedRecord(overrides: Partial<NetworkExceptionRecord> = {}): NetworkExceptionRecord {
  const base = record({
    justification: "This import is type-only and elided at build time.",
    alternatives: "No alternative typing is available upstream.",
    remediation: "Tracked upstream; will remove once DefinitelyTyped ships the stub.",
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

describe("evaluateSecurityNetworkPolicy", () => {
  it("passes and reports the files-scanned count when there are no findings", async () => {
    const result = await evaluateSecurityNetworkPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No prohibited network capability found")
    expect(result.rationale).toContain("39 file(s)")
  })

  it("fails when zero files were scanned, even with no findings", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ filesScanned: 0 }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("zero files scanned")
  })

  it("fails and lists every finding by file, location, and capability when no record backs them", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP, EVIL_CURL] }),
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 prohibited or unverifiable network capability finding(s)")
    expect(result.rationale).toContain("src/presets/evil.ts:3:8 [restricted-module-import]")
    expect(result.rationale).toContain("src/presets/evil.ts:10:1 [unreviewed-preset-command]")
    expect(result.rationale).toContain(".repo-contract/exceptions/security-network.json")
    expect(result.rationale).toContain("no matching exception record")
  })

  it("forbids a capability kind with no waiver path outright, even with a fully verified matching record", async () => {
    const future = "some-future-kind" as NetworkCapabilityKind
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [{ ...EVIL_HTTP, capability: future }] }),
      loadRegistry: async () => ({
        ok: true,
        records: [verifiedRecord({ id: `${future}:src/presets/evil.ts:3`, capability: future })],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("forbidden by policy")
  })

  it("passes a finding backed by a fully verified, matching exception record", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: true, records: [verifiedRecord()] }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails a matching-but-unverified record, surfacing verification.verifiedBy once every authoring field is filled", async () => {
    const unverified = record({
      justification: "Filled in.",
      alternatives: "Filled in.",
      remediation: "Filled in.",
      exceptionType: "accepted-risk",
    })
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: true, records: [unverified] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("verification.verifiedBy")
  })

  it("stages the rationale to omit verification.verifiedBy while authoring fields are still missing", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: true, records: [record()] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("verification.verifiedBy")
    expect(result.rationale).toContain("justification")
  })

  it("reverts a verified record to insufficient once its verified content is edited (content-bound staleness)", async () => {
    const verified = verifiedRecord()
    const edited = {
      ...verified,
      justification: "Edited after verification, invalidating the hash.",
    }
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: true, records: [edited] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("verification.verifiedBy")
  })

  it("passes with a note when an exception record matches nothing this run (stale), even on a clean scan", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence(),
      loadRegistry: async () => ({ ok: true, records: [verifiedRecord()] }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("matched nothing this run")
  })

  it("fails when the exceptions registry itself fails validation", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: false, errors: ["exceptions[0].id is malformed"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed validation")
  })

  it("confirms the real securityNetworkPolicy module, as committed, is not itself misconfigured", async () => {
    const result = await evaluateSecurityNetworkPolicy({
      evidence: evidence({ findings: [EVIL_HTTP] }),
      loadRegistry: async () => ({ ok: true, records: [] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("misconfigured")
  })
})
