import { describe, expect, it } from "vitest"
import { evaluateApiContractPolicy } from "../../../checks/api-contract.js"
import type {
  ApiContractEvidence,
  ApiContractSnapshot,
  CommitAnalysisEvidence,
} from "../../../scripts/api-contract/evidence-types.js"

/**
 * Policy tests provide only synthetic `ApiContractEvidence` -- never touching TypeScript, API
 * Extractor, Git, or the filesystem -- and verify exclusively the policy's own outcome/rationale
 * logic, per the project's check/policy testing split. Versioning is Conventional-Commits-driven
 * (ADR 0009), so the `commits` sub-evidence is what the gate actually compares against.
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

function commits(overrides: Partial<CommitAnalysisEvidence> = {}): CommitAnalysisEvidence {
  return {
    analyzed: 1,
    prTitleConsidered: false,
    declaredLevel: "none",
    satisfied: true,
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
    commits: commits(),
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

  it("passes on a compatible change whose commits declare a sufficient bump, reporting the minimum version and the release-level comparison", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "compatible",
        requiredLevel: "minor",
        minimumRequiredVersion: "1.5.0",
        summary: "1 public contract change(s) detected:\n- Added getUsers.",
        commits: commits({ declaredLevel: "minor", satisfied: true }),
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Minimum required version if released now: 1.5.0.")
    expect(result.rationale).toContain("declare `minor`; the API diff requires `minor`.")
  })

  it("passes on a breaking change when the commits declare `major`", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "breaking",
        requiredLevel: "major",
        minimumRequiredVersion: "2.0.0",
        summary: "1 public contract change(s) detected:\n- Removed getUserByEmail.",
        diff: [
          {
            id: "pkg#getUserByEmail:function",
            path: "getUserByEmail",
            kind: "export-removed",
            compatibility: "breaking",
            explanation: "Removed getUserByEmail.",
          },
        ],
        commits: commits({ declaredLevel: "major", satisfied: true }),
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("declare `major`; the API diff requires `major`.")
  })

  it("fails when the commits under-declare the bump the API diff requires, naming the breaking change and what to add", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "breaking",
        requiredLevel: "major",
        minimumRequiredVersion: "2.0.0",
        summary: "1 public contract change(s) detected:\n- Removed getUserByEmail.",
        diff: [
          {
            id: "pkg#getUserByEmail:function",
            path: "getUserByEmail",
            kind: "export-removed",
            compatibility: "breaking",
            explanation: "Removed getUserByEmail.",
          },
        ],
        commits: commits({ declaredLevel: "patch", satisfied: false }),
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale.startsWith("Contract impact:")).toBe(true)
    expect(result.rationale).toContain("Breaking public-API change(s): `getUserByEmail`.")
    expect(result.rationale).toContain("do not declare a `major` release")
    expect(result.rationale).toContain("`BREAKING CHANGE:` footer")
  })

  it("warns (never fails) when impact is unknown, and never invents a minimum version", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "unknown",
        requiredLevel: undefined,
        minimumRequiredVersion: undefined,
        summary:
          "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
        commits: commits({ declaredLevel: "patch", satisfied: null }),
      }),
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale.startsWith("Contract impact:")).toBe(true)
    expect(result.rationale).toContain("could not be deterministically classified")
    expect(result.rationale).toContain("Manually confirm")
  })

  it("fails on a schema-version-literal-stale finding regardless of overall impact", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "breaking",
        requiredLevel: "major",
        minimumRequiredVersion: "2.0.0",
        commits: commits({ declaredLevel: "major", satisfied: true }),
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
    expect(result.rationale).toContain("Internal schema-version consistency violation(s):")
    expect(result.rationale).toContain(
      "Evidence changed shape but its `version` literal is still 1",
    )
  })

  it("never produces a generic 'version check failed' rationale", () => {
    for (const impact of ["unchanged", "compatible", "breaking", "unknown"] as const) {
      const result = evaluateApiContractPolicy({
        evidence: evidence({
          impact,
          ...(impact === "unknown"
            ? { requiredLevel: undefined, minimumRequiredVersion: undefined }
            : {}),
        }),
      })
      expect(result.rationale.toLowerCase().startsWith("version check failed")).toBe(false)
    }
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
        commits: commits({ declaredLevel: "patch", satisfied: null }),
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
        commits: commits({ satisfied: null }),
        summary:
          "No historical public API contract exists. This run establishes the initial contract baseline; v0.1.0 is recommended as the initial package version.",
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No historical public API contract exists.")
  })

  it("counts the PR title in the release-level line when it was considered", () => {
    const result = evaluateApiContractPolicy({
      evidence: evidence({
        impact: "compatible",
        requiredLevel: "minor",
        minimumRequiredVersion: "1.5.0",
        commits: commits({ analyzed: 3, prTitleConsidered: true, declaredLevel: "minor" }),
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("3 message(s) incl. the PR title declare `minor`")
  })
})
