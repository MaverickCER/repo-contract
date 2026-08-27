import { describe, expect, it } from "vitest"
import { evaluateApiContractPolicy } from "../../../checks/api-contract.js"
import type {
  ApiContractEvidence,
  ApiContractSnapshot,
} from "../../../scripts/api-contract/evidence-types.js"

/**
 * Policy tests provide only synthetic `ApiContractEvidence` -- never touching TypeScript, API
 * Extractor, or the filesystem -- and verify exclusively the policy's own outcome/rationale logic,
 * per the project's check/policy testing split.
 */

function snapshot(overrides: Partial<ApiContractSnapshot> = {}): ApiContractSnapshot {
  return {
    packageName: "repo-contract",
    apiExtractorVersion: "7.0.0",
    apiJsonSchemaVersion: 1011,
    apiJsonHash: "hash",
    ...overrides,
  }
}

function evidence(overrides: Partial<ApiContractEvidence> = {}): ApiContractEvidence {
  return {
    initialBaseline: false,
    baseline: snapshot(),
    current: snapshot(),
    diff: [],
    lowerTierDiff: [],
    impact: "unchanged",
    requiredLevel: "none",
    minimumRequiredVersion: "1.4.2",
    baselineVersion: "1.4.2",
    currentVersion: "1.4.2",
    summary: "No public API changes detected.",
    changeset: { action: "none", generatedSectionUpdated: false },
    ...overrides,
  }
}

describe("evaluateApiContractPolicy", () => {
  it("passes on an unchanged contract, rationale starting with the impact summary", () => {
    const result = evaluateApiContractPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale.startsWith("Contract impact: No public API changes detected.")).toBe(
      true,
    )
  })

  it("passes (advisory) on a compatible contract change and reports the changeset was created", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "compatible",
        requiredLevel: "minor",
        minimumRequiredVersion: "1.5.0",
        summary: "1 public contract change(s) detected:\n- Added getUsers.",
        changeset: {
          action: "created",
          path: ".changeset/api-contract.md",
          requiredReleaseLevel: "minor",
          effectiveReleaseLevel: "minor",
          generatedSectionUpdated: true,
        },
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Changeset created: .changeset/api-contract.md")
    expect(result.rationale).toContain("1.5.0")
  })

  it("passes (advisory, never fails) on a breaking contract change and reports the changeset update, including human vs. effective level", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "breaking",
        requiredLevel: "major",
        minimumRequiredVersion: "2.0.0",
        summary: "1 public contract change(s) detected:\n- Removed getUserByEmail.",
        changeset: {
          action: "updated",
          path: ".changeset/some-human-changeset.md",
          humanReleaseLevel: "minor",
          requiredReleaseLevel: "major",
          effectiveReleaseLevel: "major",
          generatedSectionUpdated: true,
        },
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Changeset updated: .changeset/some-human-changeset.md")
    expect(result.rationale).toContain("Human release level: minor")
    expect(result.rationale).toContain("Effective release level: major")
  })

  it("warns (never fails) when impact is unknown, and never invents a minimum version", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "unknown",
        requiredLevel: undefined,
        minimumRequiredVersion: undefined,
        summary:
          "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
        changeset: { action: "none", generatedSectionUpdated: false },
      }),
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale.startsWith("Contract impact:")).toBe(true)
    expect(result.rationale).toContain("Manual review")
  })

  it("fails on a schema-version-literal-stale finding regardless of overall impact or changeset action", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "breaking",
        requiredLevel: "major",
        minimumRequiredVersion: "2.0.0",
        diff: [
          {
            id: "ref#schema-version-literal",
            path: "Evidence",
            kind: "schema-version-literal-stale",
            compatibility: "breaking",
            explanation: "Evidence changed shape but its `version` literal is still 1 -- bump it.",
          },
        ],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale.startsWith("Contract impact:")).toBe(true)
    expect(result.rationale).toContain(
      "Evidence changed shape but its `version` literal is still 1",
    )
  })

  it("never produces a generic 'version check failed' rationale", () => {
    for (const impact of ["unchanged", "compatible", "breaking", "unknown"] as const) {
      const result = evaluateApiContractPolicy({ evidence: evidence({ impact }) })
      expect(result.rationale.toLowerCase().startsWith("version check failed")).toBe(false)
    }
  })

  it("reports a removed (stale, cleaned-up) changeset on an unchanged contract", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        changeset: {
          action: "removed",
          path: ".changeset/api-contract.md",
          generatedSectionUpdated: true,
        },
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Stale changeset removed")
    expect(result.rationale).toContain(".changeset/api-contract.md")
  })

  it("surfaces non-public (lower-tier) changes as informational-only in the rationale", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        lowerTierDiff: [
          {
            id: "!pkg#InternalHelper:function",
            path: "InternalHelper",
            kind: "export-added",
            compatibility: "compatible",
            explanation: "Added InternalHelper.",
          },
        ],
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("1 non-public change(s) also detected (informational only).")
  })

  it("surfaces lower-tier changes alongside an unknown-impact warning too", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "unknown",
        requiredLevel: undefined,
        minimumRequiredVersion: undefined,
        summary:
          "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
        changeset: { action: "none", generatedSectionUpdated: false },
        lowerTierDiff: [
          {
            id: "!pkg#InternalHelper:function",
            path: "InternalHelper",
            kind: "export-added",
            compatibility: "compatible",
            explanation: "Added InternalHelper.",
          },
        ],
      }),
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("1 non-public change(s) also detected (informational only).")
  })

  it("initial-baseline evidence passes through the same path as an ordinary unchanged run", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        initialBaseline: true,
        baseline: undefined,
        baselineVersion: undefined,
        requiredLevel: "none",
        minimumRequiredVersion: "0.1.0",
        summary:
          "No historical public API contract exists. This run establishes the initial contract baseline; v0.1.0 is recommended as the initial package version.",
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No historical public API contract exists.")
  })
})
