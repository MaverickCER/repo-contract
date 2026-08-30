import { describe, expect, it } from "vitest"
import { evaluateLintPolicy } from "../../../checks/lint.js"
import type {
  CombinedLintEvidence,
  EslintMessage,
  EslintResult,
  OxlintDiagnostic,
} from "../../../checks/lint.js"

function eslintMessage(overrides: Partial<EslintMessage> = {}): EslintMessage {
  return {
    ruleId: "no-example",
    severity: 2,
    message: "example error",
    line: 1,
    column: 1,
    ...overrides,
  }
}

function eslintFile(overrides: Partial<EslintResult> = {}): EslintResult {
  return {
    filePath: "src/example.ts",
    messages: [],
    errorCount: 0,
    fatalErrorCount: 0,
    warningCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    ...overrides,
  }
}

function oxlintDiagnostic(overrides: Partial<OxlintDiagnostic> = {}): OxlintDiagnostic {
  return {
    message: "example oxlint error",
    code: "example-rule",
    severity: "error",
    filename: "src/example.ts",
    ...overrides,
  }
}

function evidence(overrides: Partial<CombinedLintEvidence> = {}): CombinedLintEvidence {
  return {
    eslint: { ok: true, value: [] },
    oxlint: { ok: true, value: { diagnostics: [], number_of_files: 1 } },
    ...overrides,
  }
}

describe("evaluateLintPolicy", () => {
  it("passes with zero errors from either tool", () => {
    const result = evaluateLintPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("ESLint reported 0 errors")
    expect(result.rationale).toContain("oxlint reported 0 errors")
  })

  it("fails on an ESLint error-severity (2) message", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({
        eslint: {
          ok: true,
          value: [eslintFile({ errorCount: 1, messages: [eslintMessage({ severity: 2 })] })],
        },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("ESLint reported 1 error(s)")
  })

  it("does not count an ESLint warning-severity (1) message as a failure -- regression guard for the exact severity boundary the gate depends on", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({
        eslint: {
          ok: true,
          // errorCount: 0 alongside a severity-1 message mirrors ESLint's real JSON formatter
          // output for a file with only warnings.
          value: [eslintFile({ errorCount: 0, messages: [eslintMessage({ severity: 1 })] })],
        },
      }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails on an oxlint error-severity diagnostic", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({
        oxlint: {
          ok: true,
          value: { diagnostics: [oxlintDiagnostic({ severity: "error" })], number_of_files: 1 },
        },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("oxlint reported 1 error(s)")
  })

  it("does not count an oxlint warning-severity diagnostic as a failure", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({
        oxlint: {
          ok: true,
          value: { diagnostics: [oxlintDiagnostic({ severity: "warning" })], number_of_files: 1 },
        },
      }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails with an infrastructure message when ESLint itself could not be evaluated", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({ eslint: { ok: false, error: "ESLint crashed" } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("ESLint could not be evaluated: ESLint crashed")
  })

  it("fails with an infrastructure message when oxlint itself could not be evaluated", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({ oxlint: { ok: false, error: "oxlint crashed" } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("oxlint could not be evaluated: oxlint crashed")
  })

  it("reports both tools' failures together when both find errors", () => {
    const result = evaluateLintPolicy({
      evidence: evidence({
        eslint: {
          ok: true,
          value: [eslintFile({ errorCount: 1, messages: [eslintMessage()] })],
        },
        oxlint: {
          ok: true,
          value: { diagnostics: [oxlintDiagnostic()], number_of_files: 1 },
        },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("ESLint reported 1 error(s)")
    expect(result.rationale).toContain("oxlint reported 1 error(s)")
  })
})
