import { describe, expect, it } from "vitest"
import { renderMarkdownSummary } from "../../../src/report/render-summary.js"
import type { CheckEvidence, Evidence, Verdict } from "../../../src/types.js"

const timing = (durationMs: number): CheckEvidence => ({
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
const evidenceOf = (durations: Record<string, number>, total = 12_000): Evidence => ({
  version: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:12.000Z",
  durationMs: total,
  checks: Object.fromEntries(Object.entries(durations).map(([id, ms]) => [id, timing(ms)])),
})
const verdictOf = (checks: Verdict["checks"], passed: boolean): Verdict => ({
  version: 2,
  passed,
  checks,
})

describe("renderMarkdownSummary() whole output", () => {
  it("renders totals, each group with its checks, and the slowest checks", () => {
    const markdown = renderMarkdownSummary(
      verdictOf(
        {
          lint: { outcome: "pass", rationale: "0 errors.\nsecond line" },
          docs: { outcome: "warn", rationale: "1 link unreachable\nmore" },
          tests: { outcome: "fail", rationale: "2 failing\nfoo.test.ts" },
          types: { outcome: "pass", rationale: "clean" },
        },
        false,
      ),
      evidenceOf({ lint: 1500, docs: 300, tests: 9000, types: 100 }, 11_900),
      { title: "Repo" },
    )
    expect(markdown).toBe(
      [
        "## Repo: FAILED",
        "",
        "| Outcome | Checks |",
        "| --- | ---: |",
        "| Failed | 1 |",
        "| Warnings | 1 |",
        "| Passed | 2 |",
        "",
        "### Failed",
        "",
        "#### tests",
        "",
        "```text",
        "2 failing\nfoo.test.ts",
        "```",
        "",
        "### Warnings",
        "",
        "- **docs** -- 1 link unreachable",
        "",
        "### Passed",
        "",
        "- **lint** -- 0 errors.",
        "- **types** -- clean",
        "",
        "### Slowest checks",
        "",
        "| Check | Time |",
        "| --- | ---: |",
        "| tests | 9.0s |",
        "| lint | 1.5s |",
        "| docs | 0.3s |",
        "| types | 0.1s |",
        "",
        "Whole run: 11.9s.",
        "",
      ].join("\n"),
    )
  })

  it("renders only the groups that have checks, with no timing section without evidence", () => {
    expect(
      renderMarkdownSummary(verdictOf({ lint: { outcome: "pass", rationale: "ok" } }, true)),
    ).toBe(
      [
        "## Contract: passed",
        "",
        "| Outcome | Checks |",
        "| --- | ---: |",
        "| Failed | 0 |",
        "| Warnings | 0 |",
        "| Passed | 1 |",
        "",
        "### Passed",
        "",
        "- **lint** -- ok",
        "",
      ].join("\n"),
    )
    expect(renderMarkdownSummary(verdictOf({}, true))).toBe(
      [
        "## Contract: passed",
        "",
        "| Outcome | Checks |",
        "| --- | ---: |",
        "| Failed | 0 |",
        "| Warnings | 0 |",
        "| Passed | 0 |",
        "",
      ].join("\n"),
    )
  })

  it("ends a failing group straight into the next heading, with one blank line between them", () => {
    const markdown = renderMarkdownSummary(
      verdictOf(
        { a: { outcome: "fail", rationale: "bad" }, b: { outcome: "warn", rationale: "meh" } },
        false,
      ),
    )
    expect(markdown).toContain("```\n\n### Warnings\n\n- **b** -- meh\n")
    expect(markdown).not.toContain("```\n\n\n")
  })

  it("keeps only the first line of a rationale, even when it is empty or starts with a newline", () => {
    const markdown = renderMarkdownSummary(
      verdictOf(
        {
          a: { outcome: "warn", rationale: "" },
          b: { outcome: "warn", rationale: "\nsecond" },
          c: { outcome: "warn", rationale: "only" },
        },
        true,
      ),
    )
    expect(markdown).toContain("- **a** -- \n- **b** -- \n- **c** -- only\n")
  })

  it("lists the slowest checks, limited by the option or to five", () => {
    const durations = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [`c${String(n)}`, n * 1000]),
    )
    const checks = Object.fromEntries(
      Object.keys(durations).map((id) => [id, { outcome: "pass" as const, rationale: "ok" }]),
    )
    const rows = (markdown: string) => markdown.split("\n").filter((line) => /^\| c\d /.test(line))
    expect(rows(renderMarkdownSummary(verdictOf(checks, true), evidenceOf(durations)))).toEqual([
      "| c7 | 7.0s |",
      "| c6 | 6.0s |",
      "| c5 | 5.0s |",
      "| c4 | 4.0s |",
      "| c3 | 3.0s |",
    ])
    expect(
      rows(renderMarkdownSummary(verdictOf(checks, true), evidenceOf(durations), { slowest: 2 })),
    ).toEqual(["| c7 | 7.0s |", "| c6 | 6.0s |"])
  })

  it("omits the timing section when there are no timed checks", () => {
    const markdown = renderMarkdownSummary(
      verdictOf({ lint: { outcome: "pass", rationale: "ok" } }, true),
      evidenceOf({}),
    )
    expect(markdown).not.toContain("Slowest checks")
    expect(markdown).not.toContain("Whole run")
  })
})
