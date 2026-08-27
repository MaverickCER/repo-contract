import { describe, expect, it } from "vitest"
import { evaluateSecurityNetworkPolicy } from "../../../checks/security-network.js"
import type { NetworkScanEvidence } from "../../../scripts/security-network/evidence-types.js"

function evidence(overrides: Partial<NetworkScanEvidence> = {}): NetworkScanEvidence {
  return {
    filesScanned: 39,
    findings: [],
    ...overrides,
  }
}

describe("evaluateSecurityNetworkPolicy", () => {
  it("passes and reports the files-scanned count when there are no findings", () => {
    const result = evaluateSecurityNetworkPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No prohibited network capability found")
    expect(result.rationale).toContain("39 file(s)")
  })

  it("fails and lists every finding by file, location, and capability", () => {
    const result = evaluateSecurityNetworkPolicy({
      evidence: evidence({
        findings: [
          {
            file: "src/presets/evil.ts",
            line: 3,
            column: 8,
            capability: "restricted-module-import",
            detail: 'Imports "node:http", which performs network I/O.',
          },
          {
            file: "src/presets/evil.ts",
            line: 10,
            column: 1,
            capability: "unreviewed-preset-command",
            detail: 'Preset run command "curl" is not in the reviewed allowlist.',
          },
        ],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 prohibited or unverifiable network capability finding(s)")
    expect(result.rationale).toContain("src/presets/evil.ts:3:8 [restricted-module-import]")
    expect(result.rationale).toContain("src/presets/evil.ts:10:1 [unreviewed-preset-command]")
    expect(result.rationale).toContain("disable-comments.json")
  })
})
