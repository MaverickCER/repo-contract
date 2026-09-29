import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CheckEvidence, PolicyContext } from "../../../src/types.js"
import type * as RenderMarkdownModule from "../../../scripts/openssf-scorecard/render-markdown.js"
import type { ScorecardCheckResult } from "../../../scripts/openssf-scorecard/types.js"
import type * as WeightsModule from "../../../scripts/openssf-scorecard/weights.js"

const { mkdir, writeFile } = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("node:fs/promises", () => ({ mkdir, writeFile }))

const { renderScorecardMarkdown } = vi.hoisted(() => ({
  renderScorecardMarkdown: vi
    .fn<typeof RenderMarkdownModule.renderScorecardMarkdown>()
    .mockReturnValue("# fake markdown"),
}))
vi.mock("../../../scripts/openssf-scorecard/render-markdown.js", () => ({
  renderScorecardMarkdown,
}))

const { evaluateVulnerabilities } = vi.hoisted(() => ({
  evaluateVulnerabilities: vi.fn().mockReturnValue({
    name: "Vulnerabilities",
    score: 10,
    reason: "No unfixed vulnerabilities.",
    details: [],
  } satisfies ScorecardCheckResult),
}))
vi.mock("../../../scripts/openssf-scorecard/vulnerabilities-check.js", () => ({
  evaluateVulnerabilities,
}))

const { runGit } = vi.hoisted(() => ({
  runGit: vi.fn().mockResolvedValue("abc123abc123abc123abc123abc123abc123abc1\n"),
}))
vi.mock("../../../scripts/diff-files.js", () => ({ runGit }))

const { packageVersion } = vi.hoisted(() => ({
  packageVersion: vi.fn().mockReturnValue("0.7.3"),
}))
vi.mock("../../../scripts/openssf-scorecard/gh-api.js", () => ({ packageVersion }))

// `computeWeightedAverage` is left as the real implementation (via
// `importOriginal`) throughout this file -- only `fetchScorecardWeights` (a
// real gh-CLI/network call) is mocked -- so every rationale/markdown-input
// assertion below exercises the actual weighting arithmetic end to end,
// rather than a second, hand-duplicated copy of the formula.
const { fetchScorecardWeights } = vi.hoisted(() => ({
  fetchScorecardWeights: vi.fn<typeof WeightsModule.fetchScorecardWeights>(),
}))
vi.mock("../../../scripts/openssf-scorecard/weights.js", async (importOriginal) => {
  const actual = await importOriginal<typeof WeightsModule>()
  return { ...actual, fetchScorecardWeights }
})

const { openssfScorecard } = await import("../../../checks/openssf-scorecard.js")

const WEIGHTS = {
  "Branch-Protection": 7.5,
  "Dangerous-Workflow": 10,
  "Pinned-Dependencies": 5,
  License: 2.5,
  Vulnerabilities: 7.5,
}

function mockWeightsAvailable(): void {
  fetchScorecardWeights.mockReturnValue({
    ok: true,
    value: {
      weights: WEIGHTS,
      source: {
        checksYamlUrl:
          "https://github.com/ossf/scorecard/blob/main/docs/checks/internal/checks.yaml",
        aggregationSourceUrl:
          "https://github.com/ossf/scorecard/blob/main/pkg/scorecard/scorecard_result.go",
      },
    },
  })
}

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
  beforeEach(() => {
    vi.clearAllMocks()
    runGit.mockResolvedValue("abc123abc123abc123abc123abc123abc123abc1\n")
    packageVersion.mockReturnValue("0.7.3")
    evaluateVulnerabilities.mockReturnValue({
      name: "Vulnerabilities",
      score: 10,
      reason: "No unfixed vulnerabilities.",
      details: [],
    } satisfies ScorecardCheckResult)
    mkdir.mockResolvedValue(undefined)
    writeFile.mockResolvedValue(undefined)
    renderScorecardMarkdown.mockReturnValue("# fake markdown")
    mockWeightsAvailable()
  })

  it("fails with requireParsedOutput's rationale when output never parsed", async () => {
    const result = await openssfScorecard.policy(
      ctx({ result: evidence({ output: { format: "json", success: false, error: "boom" } }) }),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("boom")
  })

  it("warns, citing gh CLI unavailability, when every sub-check is not-applicable", async () => {
    evaluateVulnerabilities.mockReturnValueOnce({
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
    // Nothing was evaluated, so the aggregate is never used -- the live
    // weight-table fetch (a real gh-CLI/network round-trip) must not even
    // be attempted in this path.
    expect(fetchScorecardWeights).not.toHaveBeenCalled()
    const markdownInput = renderScorecardMarkdown.mock.calls.at(-1)?.[0]
    expect(markdownInput?.weights).toBeUndefined()
    expect(markdownInput?.weightsUnavailableReason).toBeUndefined()
    expect(markdownInput?.weightedAverage).toBeUndefined()
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

  it("labels the aggregate as a weighted average, not a bare average, and computes it via the real weighted formula", async () => {
    // Branch-Protection(2, w7.5) + Dangerous-Workflow(0, w10) +
    // Pinned-Dependencies(8, w5) + Vulnerabilities(10, w7.5, mocked default):
    // Σ(score*weight) = 15 + 0 + 40 + 75 = 130; Σ(weight) = 30 -> 130/30 = 4.333..
    const result = await openssfScorecard.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              repo: "acme/widgets",
              results: results(
                { name: "Branch-Protection", score: 2 },
                { name: "Dangerous-Workflow", score: 0 },
                { name: "Pinned-Dependencies", score: 8 },
              ),
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("weighted average score 4.3/10")
  })

  it("weighted average differs from a simple average when per-check weights differ -- proving the arithmetic is actually weighted", async () => {
    // Branch-Protection(10, w7.5) + License(0, w2.5), Vulnerabilities excluded via evaluateVulnerabilities override below.
    // Weighted: (10*7.5 + 0*2.5) / (7.5+2.5) = 75/10 = 7.5. Simple average would be 5.
    evaluateVulnerabilities.mockReturnValueOnce({
      name: "Vulnerabilities",
      score: "not-applicable",
      reason: "not run",
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
              results: results(
                { name: "Branch-Protection", score: 10 },
                { name: "License", score: 0 },
              ),
            },
          },
        }),
      }),
    )
    expect(result.rationale).toContain("weighted average score 7.5/10")
  })

  it("falls back to equal weighting and notes the failure when the live weight fetch fails, without failing the check", async () => {
    fetchScorecardWeights.mockReturnValue({
      ok: false,
      reason: "unavailable",
      message: "gh CLI is not installed.",
    })
    evaluateVulnerabilities.mockReturnValueOnce({
      name: "Vulnerabilities",
      score: "not-applicable",
      reason: "not run",
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
              results: results(
                { name: "Branch-Protection", score: 4 },
                { name: "License", score: 8 },
              ),
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    // Equal weighting (weight 1 each): (4+8)/2 = 6.
    expect(result.rationale).toContain("weighted average score 6.0/10")
    expect(result.rationale).toContain("equal weighting -- live weight fetch failed")
    const markdownInput = renderScorecardMarkdown.mock.calls.at(-1)?.[0]
    expect(markdownInput?.weightsUnavailableReason).toBe("gh CLI is not installed.")
    expect(markdownInput?.weights).toBeUndefined()
  })

  it("passes the live-fetched weight table through to the markdown renderer, so a reader can reconstruct the weighted score from the rendered document alone", async () => {
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
    const markdownInput = renderScorecardMarkdown.mock.calls.at(-1)?.[0]
    expect(markdownInput?.weights).toEqual(WEIGHTS)
  })

  it("passes provenance (date, repo, commit, evaluator version) to the markdown renderer", async () => {
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
    const markdownInput = renderScorecardMarkdown.mock.calls.at(-1)?.[0]
    expect(typeof markdownInput?.provenance.date).toBe("string")
    expect(markdownInput?.provenance.repo).toEqual({
      name: "acme/widgets",
      commit: "abc123abc123abc123abc123abc123abc123abc1",
    })
    expect(markdownInput?.provenance.scorecard).toEqual({
      version: "0.7.3",
      commit: "abc123abc123abc123abc123abc123abc123abc1",
    })
    expect(runGit).toHaveBeenCalledWith(["rev-parse", "HEAD"], expect.any(String))
  })

  it('falls back to "unknown" for the commit when git rev-parse fails', async () => {
    runGit.mockResolvedValueOnce(undefined)
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
    const markdownInput = renderScorecardMarkdown.mock.calls.at(-1)?.[0]
    expect(markdownInput?.provenance.repo.commit).toBe("unknown")
    expect(markdownInput?.provenance.scorecard.commit).toBe("unknown")
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
