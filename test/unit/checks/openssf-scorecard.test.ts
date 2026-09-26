import { describe, expect, it, vi } from "vitest"
import type { CheckEvidence, PolicyContext } from "../../../src/types.js"
import type { ScorecardCheckResult } from "../../../scripts/openssf-scorecard/types.js"

const { mkdir, writeFile } = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("node:fs/promises", () => ({ mkdir, writeFile }))
vi.mock("../../../scripts/openssf-scorecard/render-markdown.js", () => ({
  renderScorecardMarkdown: vi.fn().mockReturnValue("# fake markdown"),
}))
vi.mock("../../../scripts/openssf-scorecard/vulnerabilities-check.js", () => ({
  evaluateVulnerabilities: vi.fn().mockReturnValue({
    name: "Vulnerabilities",
    score: 10,
    reason: "No unfixed vulnerabilities.",
    details: [],
  } satisfies ScorecardCheckResult),
}))

const { openssfScorecard } = await import("../../../checks/openssf-scorecard.js")

function evidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "tsx",
    args: ["scripts/openssf-scorecard/run.ts"],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    result: evidence(),
    evidence: { version: 1, startedAt: "", completedAt: "", durationMs: 0, checks: {} },
    dependencies: {},
    ...overrides,
  }
}

function results(
  ...partial: readonly (Pick<ScorecardCheckResult, "name" | "score"> &
    Partial<ScorecardCheckResult>)[]
): readonly ScorecardCheckResult[] {
  return partial.map((r) => ({ reason: `${r.name} reason`, details: [], ...r }))
}

describe("openssfScorecard.policy", () => {
  it("fails with requireParsedOutput's rationale when output never parsed", async () => {
    const result = await openssfScorecard.policy(
      ctx({ result: evidence({ output: { format: "json", success: false, error: "boom" } }) }),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("boom")
  })

  it("warns, citing gh CLI unavailability, when every sub-check is not-applicable", async () => {
    vi.mocked(
      (await import("../../../scripts/openssf-scorecard/vulnerabilities-check.js"))
        .evaluateVulnerabilities,
    ).mockReturnValueOnce({
      name: "Vulnerabilities",
      score: "not-applicable",
      reason: "not-applicable",
      details: [],
    })
    const result = await openssfScorecard.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              repo: "acme/widgets",
              results: results({ name: "Maintained", score: "not-applicable" }),
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("gh CLI may be unavailable")
    expect(result.rationale).toContain("2 not-applicable")
  })

  it("passes and states every evaluated check already scores a perfect 10, when none needs attention", async () => {
    const result = await openssfScorecard.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              repo: "acme/widgets",
              results: results({ name: "Branch-Protection", score: 10 }),
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Every evaluated check already scores a perfect 10/10")
    expect(result.rationale).not.toContain("Needs attention")
  })

  it("passes, but inlines every non-perfect sub-check worst-first with its own name/score/reason -- never deferring detail to the generated doc alone", async () => {
    const result = await openssfScorecard.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              repo: "acme/widgets",
              results: results(
                { name: "Branch-Protection", score: 2, reason: "No required reviews configured." },
                {
                  name: "Dangerous-Workflow",
                  score: 0,
                  reason: "pull_request_target used unsafely.",
                },
                { name: "Pinned-Dependencies", score: 8, reason: "2 of 14 actions unpinned." },
              ),
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("average score")
    expect(result.rationale).toContain("Needs attention, worst first:")
    // Worst (lowest score) first.
    const dangerousIndex = result.rationale.indexOf("Dangerous-Workflow")
    const branchIndex = result.rationale.indexOf("Branch-Protection")
    const pinnedIndex = result.rationale.indexOf("Pinned-Dependencies")
    expect(dangerousIndex).toBeGreaterThan(-1)
    expect(dangerousIndex).toBeLessThan(branchIndex)
    expect(branchIndex).toBeLessThan(pinnedIndex)
    expect(result.rationale).toContain(
      "Dangerous-Workflow 0/10 -- pull_request_target used unsafely.",
    )
    expect(result.rationale).toContain("Branch-Protection 2/10 -- No required reviews configured.")
    expect(result.rationale).toContain("Pinned-Dependencies 8/10 -- 2 of 14 actions unpinned.")
    // A perfect Vulnerabilities score (mocked default) never appears in the "needs attention" list.
    expect(result.rationale).not.toContain("Vulnerabilities 10")
  })

  it("writes docs/OpenSSF-Scorecard.md on every successful pass/warn run, creating its parent directory first", async () => {
    await openssfScorecard.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              repo: "acme/widgets",
              results: results({ name: "Branch-Protection", score: 10 }),
            },
          },
        }),
      }),
    )
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("docs"), { recursive: true })
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("OpenSSF-Scorecard.md"),
      "# fake markdown",
    )
  })
})
