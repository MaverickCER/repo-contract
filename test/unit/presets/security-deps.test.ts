import { describe, expect, it } from "vitest"
import { securityDeps } from "../../../src/presets/security-deps.js"
import { fakeContext, fakeCheckEvidence } from "./fixtures.js"

function withVulns(
  counts: Partial<Record<"info" | "low" | "moderate" | "high" | "critical", number>>,
) {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        ...counts,
      },
    },
    vulnerabilities: {},
  }
}

describe("securityDeps preset", () => {
  it("shells out to npm audit --omit=dev --json", () => {
    expect(securityDeps.run).toEqual(["npm", "audit", "--omit=dev", "--json"])
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await securityDeps.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "npm audit output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await securityDeps.policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "npm audit output could not be parsed as JSON.",
    })
  })

  it("fails when metadata.vulnerabilities is missing", async () => {
    const result = await securityDeps.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: {} } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "npm audit produced no vulnerability summary.",
    })
  })

  it("passes with the exact rationale when every severity count is 0", async () => {
    const result = await securityDeps.policy(
      fakeContext(
        fakeCheckEvidence({ output: { format: "json", success: true, value: withVulns({}) } }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale:
        "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 0 low vulnerabilities were found.",
    })
  })

  it("fails (not passes) when a severity count is missing from the summary -- NaN must not read as 0", async () => {
    const result = await securityDeps.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            // `high` omitted: `undefined + n === NaN`, and both `NaN > 0`
            // and `undefined > 0` are false -- the old code returned "pass".
            value: { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, critical: 0 } } },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('"high"')
  })

  it("fails when npm audit itself timed out rather than misreporting it as a parse failure", async () => {
    const result = await securityDeps.policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null, output: undefined })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("did not finish")
  })

  it("warns when only info-severity findings remain", async () => {
    const result = await securityDeps.policy(
      fakeContext(
        fakeCheckEvidence({
          output: { format: "json", success: true, value: withVulns({ info: 3 }) },
        }),
      ),
    )
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("3 info-severity")
  })

  it("sums all four blocking severities correctly -- the exact count in the rationale catches a miscalculated sum", async () => {
    // Distinct, non-overlapping magnitudes: any single severity's count
    // being dropped, double-counted, or subtracted instead of added would
    // produce a total other than 15.
    const result = await securityDeps.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: withVulns({ low: 1, moderate: 2, high: 4, critical: 8 }),
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("npm audit found 15 runtime vulnerability(ies):")
  })

  it("fails and renders direct/transitive, fixAvailable, range, and unknown-severity variants, sorted alphabetically by package name, joined by newline", async () => {
    const report = {
      metadata: {
        vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 },
      },
      vulnerabilities: {
        // Deliberately inserted in reverse-alphabetical order to prove the
        // rendered list is sorted, not just echoed in Object.entries order.
        "zeta-pkg": { isDirect: true, fixAvailable: false },
        "pkg-b": {
          severity: "low",
          isDirect: false,
          fixAvailable: { name: "pkg-b", version: "2.0.0" },
        },
        "alpha-pkg": { severity: "low", isDirect: true, range: ">=1.0.0", fixAvailable: true },
      },
    }
    const result = await securityDeps.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "npm audit found 1 runtime vulnerability(ies):",
        "- alpha-pkg: low (direct) range=>=1.0.0; fix available",
        "- pkg-b: low (transitive); remediation available",
        "- zeta-pkg: unknown (direct); no automatic fix available",
      ].join("\n"),
    )
  })
})
