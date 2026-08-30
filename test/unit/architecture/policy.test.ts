import { describe, expect, it } from "vitest"
import { evaluateArchitecturePolicy } from "../../../checks/architecture.js"
import type { ArchitectureEvidence } from "../../../scripts/architecture/evidence-types.js"

const cleanEvidence: ArchitectureEvidence = {
  dependencyGraph: {
    ok: true,
    modulesAnalyzed: 19,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    violations: [],
  },
  testCategoryBoundaries: { ok: true, filesScanned: 32, violations: [] },
  adrStructure: { ok: true, filesScanned: 10, violations: [] },
}

describe("evaluateArchitecturePolicy", () => {
  it("passes when there are no dependency-graph violations and no boundary violations", () => {
    const result = evaluateArchitecturePolicy({ evidence: cleanEvidence })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 violations")
    expect(result.rationale).toContain("0 errors")
  })

  it("fails when dependency-cruiser itself could not be evaluated -- a tool-infrastructure failure, not a rule violation", () => {
    const evidence: ArchitectureEvidence = {
      dependencyGraph: { ok: false, error: "spawn depcruise ENOENT" },
      testCategoryBoundaries: { ok: true, filesScanned: 32, violations: [] },
      adrStructure: { ok: true, filesScanned: 10, violations: [] },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("could not be evaluated")
    expect(result.rationale).toContain("ENOENT")
  })

  it("fails on an error-severity dependency-graph violation", () => {
    const evidence: ArchitectureEvidence = {
      ...cleanEvidence,
      dependencyGraph: {
        ok: true,
        modulesAnalyzed: 19,
        errorCount: 1,
        warnCount: 0,
        infoCount: 0,
        violations: [
          {
            from: "src/execution/spawn-check.ts",
            to: "src/policy/run-policies.ts",
            rule: "execution-must-not-import-evidence-or-policy",
            severity: "error",
            comment: "protects ADR 0001",
          },
        ],
      },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("execution-must-not-import-evidence-or-policy")
  })

  it("warns (never fails) on a warn/info-only dependency-graph finding", () => {
    const evidence: ArchitectureEvidence = {
      ...cleanEvidence,
      dependencyGraph: {
        ok: true,
        modulesAnalyzed: 19,
        errorCount: 0,
        warnCount: 1,
        infoCount: 0,
        violations: [
          {
            from: "src/index.ts",
            to: "src/errors.ts",
            rule: "some-warn-rule",
            severity: "warn",
            comment: "advisory only",
          },
        ],
      },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("some-warn-rule")
  })

  it("fails on a test-category boundary violation, even with a clean dependency graph", () => {
    const evidence: ArchitectureEvidence = {
      ...cleanEvidence,
      testCategoryBoundaries: {
        ok: true,
        filesScanned: 32,
        violations: [
          'vitest.unit.config.ts\'s "include" pattern "test/integration/**/*.test.ts" does not stay within test/unit/',
        ],
      },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("does not stay within test/unit/")
  })

  it("fails when both a boundary violation and an error-severity dependency-graph violation are present, reporting both", () => {
    const evidence: ArchitectureEvidence = {
      dependencyGraph: {
        ok: true,
        modulesAnalyzed: 19,
        errorCount: 1,
        warnCount: 0,
        infoCount: 0,
        violations: [
          {
            from: "src/config/validate-config.ts",
            to: "src/execution/spawn-check.ts",
            rule: "config-must-not-import-execution-evidence-or-policy",
            severity: "error",
            comment: "config is foundational",
          },
        ],
      },
      testCategoryBoundaries: {
        ok: true,
        filesScanned: 32,
        violations: [
          "some-file.test.ts belongs to 0 category directories (expected exactly 1): none",
        ],
      },
      adrStructure: { ok: true, filesScanned: 10, violations: [] },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("config-must-not-import-execution-evidence-or-policy")
    expect(result.rationale).toContain("some-file.test.ts belongs to 0 category directories")
  })

  it("fails when the ADR-structure scan itself could not be evaluated -- a tool-infrastructure failure, not a rule violation", () => {
    const evidence: ArchitectureEvidence = {
      ...cleanEvidence,
      adrStructure: { ok: false, error: "ENOENT: specs/decisions/ not found" },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("ADR structure could not be evaluated")
    expect(result.rationale).toContain("specs/decisions/ not found")
  })

  it("fails on an ADR-structure violation, even with a clean dependency graph and clean test-category boundaries", () => {
    const evidence: ArchitectureEvidence = {
      ...cleanEvidence,
      adrStructure: {
        ok: true,
        filesScanned: 10,
        violations: ["ADR number 0003 is used by more than one file: 0003-a.md, 0003-b.md"],
      },
    }
    const result = evaluateArchitecturePolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("ADR number 0003 is used by more than one file")
  })
})
