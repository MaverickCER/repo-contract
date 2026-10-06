import { describe, expect, it } from "vitest"
import { renderMarkdownSummary, serializeRun } from "../../../src/report/render-summary.js"
import type { CheckEvidence, Evidence, Verdict } from "../../../src/types.js"

const checkEvidence = (durationMs: number): CheckEvidence => ({
  command: "x",
  args: [],
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  durationMs,
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  status: "completed",
})

const verdict = (passed = false): Verdict => ({
  version: 2,
  passed,
  checks: {
    lint: { outcome: "pass", rationale: "0 errors.\nsecond line" },
    docs: { outcome: "warn", rationale: "1 external link unreachable" },
    tests: { outcome: "fail", rationale: "2 failing\nfoo.test.ts\nbar.test.ts" },
  },
})
const evidence: Evidence = {
  version: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:12.000Z",
  durationMs: 12_000,
  checks: { lint: checkEvidence(1500), docs: checkEvidence(300), tests: checkEvidence(9000) },
}

describe("renderMarkdownSummary()", () => {
  it("leads with the result and the totals", () => {
    const md = renderMarkdownSummary(verdict())
    expect(md.startsWith("## Contract: FAILED\n")).toBe(true)
    expect(md).toContain("| Failed | 1 |")
    expect(md).toContain("| Warnings | 1 |")
    expect(md).toContain("| Passed | 1 |")
    expect(
      renderMarkdownSummary(verdict(true), undefined, { title: "CI" }).startsWith(
        "## CI: passed\n",
      ),
    ).toBe(true)
  })

  it("shows a failing check's whole rationale, and a warning's or pass's first line only", () => {
    const md = renderMarkdownSummary(verdict())
    expect(md).toContain("#### tests\n\n```text\n2 failing\nfoo.test.ts\nbar.test.ts\n```")
    expect(md).toContain("- **docs** -- 1 external link unreachable")
    expect(md).toContain("- **lint** -- 0 errors.")
    expect(md).not.toContain("second line")
  })

  it("orders the groups failed, warnings, passed, and omits an empty one", () => {
    const md = renderMarkdownSummary(verdict())
    expect(md.indexOf("### Failed")).toBeLessThan(md.indexOf("### Warnings"))
    expect(md.indexOf("### Warnings")).toBeLessThan(md.indexOf("### Passed"))
    const onlyPass = renderMarkdownSummary({
      version: 2,
      passed: true,
      checks: { lint: { outcome: "pass", rationale: "ok" } },
    })
    expect(onlyPass).not.toContain("### Failed")
    expect(onlyPass).not.toContain("### Warnings")
  })

  it("lists the slowest checks with their time when given the evidence, honouring the limit", () => {
    const md = renderMarkdownSummary(verdict(), evidence, { slowest: 2 })
    expect(md).toContain("### Slowest checks")
    expect(md).toContain("| tests | 9.0s |")
    expect(md).toContain("| lint | 1.5s |")
    expect(md).not.toContain("| docs |")
    expect(md).toContain("Whole run: 12.0s.")
  })

  it("lists up to five by default, and nothing when no check ran", () => {
    expect(
      renderMarkdownSummary(verdict(), evidence).match(/^\| (tests|lint|docs) \|/gm),
    ).toHaveLength(3)
    const none = renderMarkdownSummary(
      { version: 2, passed: true, checks: {} },
      { ...evidence, checks: {} },
    )
    expect(none).not.toContain("Slowest")
  })

  it("ends with a newline and reads nothing from outside its arguments", () => {
    expect(renderMarkdownSummary(verdict()).endsWith("\n")).toBe(true)
  })
})

describe("serializeRun()", () => {
  it("returns stable, indented JSON with a trailing newline, one document each", () => {
    const out = serializeRun({ evidence, verdict: verdict() })
    expect(out.evidence).toBe(`${JSON.stringify(evidence, null, 2)}\n`)
    expect(out.verdict).toBe(`${JSON.stringify(verdict(), null, 2)}\n`)
    expect(JSON.parse(out.verdict)).toEqual(verdict())
  })

  it("writes a bigint as its decimal string instead of throwing, and leaves other values alone", () => {
    const withBigint = {
      ...verdict(),
      checks: { big: { outcome: "pass", rationale: "ok", output: 12345678901234567890n } },
    } as never
    const out = serializeRun({ evidence, verdict: withBigint })
    const parsed = JSON.parse(out.verdict) as {
      checks: { big: { output: unknown; rationale: string } }
    }
    expect(parsed.checks.big.output).toBe("12345678901234567890")
    expect(parsed.checks.big.rationale).toBe("ok")
    expect(JSON.parse(out.evidence)).toEqual(JSON.parse(JSON.stringify(evidence)))
    expect(out.verdict.endsWith("\n")).toBe(true)
  })

  it("keeps a numeric value a number", () => {
    const withNumber = {
      ...verdict(),
      checks: { n: { outcome: "pass", rationale: "ok", output: 42 } },
    } as never
    expect(
      (
        JSON.parse(serializeRun({ evidence, verdict: withNumber }).verdict) as never as {
          checks: { n: { output: unknown } }
        }
      ).checks.n.output,
    ).toBe(42)
  })
})
