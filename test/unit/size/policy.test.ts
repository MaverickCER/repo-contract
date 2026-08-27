import { describe, expect, it } from "vitest"
import { evaluateSizePolicy, SIZE_BUDGETS } from "../../../checks/size.js"
import type { SizeReport, SizeReportEntry } from "../../../checks/size.js"

function passingEntries(): SizeReportEntry[] {
  return SIZE_BUDGETS.map((budget) => ({
    label: budget.label,
    file: budget.file,
    gzipBytes: budget.maxGzipBytes,
    maxGzipBytes: budget.maxGzipBytes,
  }))
}

function report(entries: readonly SizeReportEntry[]): SizeReport {
  return { generatedAt: "2026-01-01T00:00:00.000Z", entries }
}

describe("evaluateSizePolicy", () => {
  it("passes when every budgeted file is exactly at its budget -- the boundary is inclusive", () => {
    const result = evaluateSizePolicy({ evidence: report(passingEntries()) })
    expect(result.outcome).toBe("pass")
  })

  it("fails when a budgeted file is even one byte over its budget", () => {
    const [first, ...rest] = passingEntries()
    const entries = [{ ...first!, gzipBytes: first!.maxGzipBytes! + 1 }, ...rest]
    const result = evaluateSizePolicy({ evidence: report(entries) })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(first!.file)
    expect(result.rationale).toContain("exceeds")
  })

  it("passes when a budgeted file is under its budget", () => {
    const [first, ...rest] = passingEntries()
    const entries = [{ ...first!, gzipBytes: first!.maxGzipBytes! - 1 }, ...rest]
    const result = evaluateSizePolicy({ evidence: report(entries) })
    expect(result.outcome).toBe("pass")
  })

  it("fails when the report has no entry at all for a budgeted file", () => {
    const result = evaluateSizePolicy({ evidence: report([]) })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("has no entry for this file")
  })

  it("fails when a budgeted file's gzip size is null (build not yet run)", () => {
    const [first, ...rest] = passingEntries()
    const entries = [{ ...first!, gzipBytes: null }, ...rest]
    const result = evaluateSizePolicy({ evidence: report(entries) })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("run `npm run build` first")
  })

  it("reports every budget's actual/max size in a passing rationale", () => {
    const result = evaluateSizePolicy({ evidence: report(passingEntries()) })
    for (const budget of SIZE_BUDGETS) {
      expect(result.rationale).toContain(budget.label)
    }
  })
})
