import { describe, expect, it } from "vitest"
import { validateAuditReport } from "../../../checks/security-deps.js"

describe("validateAuditReport", () => {
  it("accepts a real, completed npm audit report with a non-empty vulnerabilities object", () => {
    const report = { vulnerabilities: { "left-pad": { severity: "high", range: "<=1.3.0" } } }
    const result = validateAuditReport(report)
    expect(result).toEqual({ ok: true, report })
  })

  it("accepts a completed npm audit report with zero vulnerabilities", () => {
    const report = { vulnerabilities: {} }
    expect(validateAuditReport(report)).toEqual({ ok: true, report })
  })

  it("rejects a top-level array instead of a report object", () => {
    const result = validateAuditReport([])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("array")
  })

  it("rejects npm audit's own documented scan-failure shape, surfacing its error detail", () => {
    const result = validateAuditReport({ error: { code: "ENETUNREACH", summary: "network error" } })
    expect(result).toEqual({
      ok: false,
      reason: "npm audit could not complete the scan: ENETUNREACH: network error.",
    })
  })

  it("rejects the error shape even when code/summary are both absent, without throwing", () => {
    const result = validateAuditReport({ error: {} })
    expect(result).toEqual({ ok: false, reason: "npm audit could not complete the scan." })
  })

  it("does not treat error: null as a real scan-failure marker", () => {
    const report = { error: null, vulnerabilities: {} }
    expect(validateAuditReport(report)).toEqual({ ok: true, report })
  })

  it("does not treat an explicitly-present error: undefined key as a real scan-failure marker", () => {
    const report = { error: undefined, vulnerabilities: {} }
    expect(validateAuditReport(report)).toEqual({ ok: true, report })
  })

  it("rejects a report with no vulnerabilities key at all, rather than defaulting to zero findings", () => {
    const result = validateAuditReport({ metadata: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('"vulnerabilities"')
  })

  it("rejects a report whose vulnerabilities field is null", () => {
    const result = validateAuditReport({ vulnerabilities: null })
    expect(result.ok).toBe(false)
  })

  it("rejects a report whose vulnerabilities field is an array, not an object map", () => {
    const result = validateAuditReport({ vulnerabilities: [] })
    expect(result.ok).toBe(false)
  })

  it("rejects a report whose vulnerabilities field is a non-object primitive", () => {
    const result = validateAuditReport({ vulnerabilities: "clean" })
    expect(result.ok).toBe(false)
  })
})
