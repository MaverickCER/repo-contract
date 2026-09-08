import { describe, expect, it } from "vitest"
import { evaluateSecurityNetworkPolicy } from "../../../checks/security-network.js"
import type {
  NetworkCapabilityFinding,
  NetworkExceptionRecord,
  NetworkScanEvidence,
} from "../../../scripts/security-network/evidence-types.js"
import {
  VALID_SECURITY_NETWORK_REQUIREMENTS,
  securityNetworkPolicy,
} from "../../../scripts/security-network/policy-config.js"
import {
  createNetworkStub,
  deriveNetworkExceptionId,
} from "../../../scripts/security-network/registry.js"
import { validateExceptionPolicyConfig } from "../../../src/helpers/index.js"

function finding(overrides: Partial<NetworkCapabilityFinding> = {}): NetworkCapabilityFinding {
  const base = {
    file: "src/presets/evil.ts",
    line: 3,
    column: 8,
    capability: "restricted-module-import" as NetworkCapabilityFinding["capability"],
    detail: 'Imports "node:http".',
    ...overrides,
  }
  return { ...base, id: deriveNetworkExceptionId(base) }
}

const COMPLETE = {
  justification: "This import is type-only and elided at build time.",
  alternatives: "No alternative typing is available upstream.",
  remediation: "Tracked upstream; will remove once DefinitelyTyped ships the stub.",
  method: "independent-human-review" as const,
  exceptionType: "accepted-risk" as const,
}

function record(
  from: NetworkCapabilityFinding,
  overrides: Partial<NetworkExceptionRecord> = {},
): NetworkExceptionRecord {
  return { ...createNetworkStub(from, from.id), ...overrides }
}

interface Pair {
  readonly finding: NetworkCapabilityFinding
  readonly record: NetworkExceptionRecord
}

function evidenceFor(
  pairs: readonly Pair[],
  extras: {
    readonly stale?: readonly NetworkExceptionRecord[]
    readonly filesScanned?: number
    readonly registryError?: readonly string[]
  } = {},
): NetworkScanEvidence {
  const activeExceptions: Record<string, NetworkExceptionRecord> = {}
  for (const { finding: f, record: r } of pairs) activeExceptions[f.id] = r
  return {
    registryPath: ".repo-contract/exceptions/security-network.json",
    filesScanned: extras.filesScanned ?? 39,
    findings: pairs.map((p) => p.finding),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: [],
    ...(extras.registryError !== undefined ? { registryError: extras.registryError } : {}),
  }
}

describe("evaluateSecurityNetworkPolicy", () => {
  it("passes and reports the files-scanned count when there are no findings", () => {
    const result = evaluateSecurityNetworkPolicy({ evidence: evidenceFor([]) })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No prohibited network capability found")
    expect(result.rationale).toContain("39 file(s)")
  })

  it("fails when zero files were scanned, even with no findings", () => {
    const result = evaluateSecurityNetworkPolicy({ evidence: evidenceFor([], { filesScanned: 0 }) })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("zero files scanned")
  })

  it("fails on a registryError before the zero-file gate", () => {
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidenceFor([], { filesScanned: 0, registryError: ["exceptions[0] is broken"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load or reconcile")
  })

  it("fails and lists a finding backed only by a blank stub", () => {
    const f = finding()
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidenceFor([{ finding: f, record: record(f) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/presets/evil.ts:3:8 [restricted-module-import]")
    expect(result.rationale).toContain("missing:")
  })

  it("passes a finding backed by a complete matching exception record", () => {
    const f = finding()
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, COMPLETE) }]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails a matching record missing method, naming it", () => {
    const f = finding()
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidenceFor([{ finding: f, record: record(f, { ...COMPLETE, method: "" }) }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("missing: method")
  })

  it("fails on a stale exception record whose finding is gone, even on a clean scan", () => {
    const gone = finding({ file: "src/gone.ts", line: 9 })
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidenceFor([], { stale: [record(gone, COMPLETE)] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale exception")
    expect(result.rationale).toContain(gone.id)
  })

  it("fails on a broken findings <-> activeExceptions bijection", () => {
    const f = finding()
    const evidence: NetworkScanEvidence = {
      registryPath: ".repo-contract/exceptions/security-network.json",
      filesScanned: 39,
      findings: [f],
      activeExceptions: {},
      staleExceptions: [],
      scaffoldedIds: [],
    }
    const result = evaluateSecurityNetworkPolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("bijection")
  })

  it("the committed securityNetworkPolicy passes validateExceptionPolicyConfig against its own valid-requirements set", () => {
    expect(
      validateExceptionPolicyConfig(securityNetworkPolicy, VALID_SECURITY_NETWORK_REQUIREMENTS),
    ).toEqual([])
  })
})
