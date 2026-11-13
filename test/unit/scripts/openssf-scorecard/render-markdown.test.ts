import { describe, expect, it } from "vitest"
import { renderScorecardMarkdown } from "../../../../scripts/openssf-scorecard/render-markdown.js"
import type { ScorecardProvenance } from "../../../../scripts/openssf-scorecard/types.js"

function provenance(overrides: Partial<ScorecardProvenance> = {}): ScorecardProvenance {
  return {
    date: "2026-01-01T00:00:00.000Z",
    repo: { name: "owner/repo", commit: "abc123abc123abc123abc123abc123abc123abc1" },
    scorecard: { version: "0.7.3", commit: "abc123abc123abc123abc123abc123abc123abc1" },
    ...overrides,
  }
}

describe("renderScorecardMarkdown", () => {
  it("escapes a literal backslash before escaping a pipe, so a reason containing both never corrupts the table", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [
        {
          name: "Pinned-Dependencies",
          score: 8,
          reason: String.raw`Path C:\deps|other has a pipe`,
          details: [],
        },
      ],
      weightedAverage: 8,
      weights: { "Pinned-Dependencies": 5 },
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    const row = markdown.split("\n").find((line) => line.includes("Pinned-Dependencies"))
    expect(row).toBe(
      String.raw`| Pinned-Dependencies | 8/10 | 5 | Path C:\\deps\|other has a pipe |`,
    )
  })

  it("still escapes a plain pipe with no backslash present", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [
        { name: "Token-Permissions", score: "not-applicable", reason: "a | b", details: [] },
      ],
      weightedAverage: undefined,
      weights: undefined,
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    const row = markdown.split("\n").find((line) => line.includes("Token-Permissions"))
    expect(row).toBe("| Token-Permissions | N/A | -- | a \\| b |")
  })

  it("renders the real weight used for an evaluated check, so the weighted score can be reconstructed from this table alone", () => {
    // (10*10 + 6*2.5) / (10+2.5) = 115/12.5 = 9.2: the fixture's own
    // `weightedAverage` matches what the per-row scores/weights below
    // actually compute to, so this test also proves the rendered aggregate
    // is reconstructable from the table, not just an arbitrary passed-in
    // number.
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [
        { name: "Dangerous-Workflow", score: 10, reason: "clean", details: [] },
        { name: "License", score: 6, reason: "partial", details: [] },
      ],
      weightedAverage: 9.2,
      weights: { "Dangerous-Workflow": 10, License: 2.5 },
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).toContain("| Dangerous-Workflow | 10/10 | 10 | clean |")
    expect(markdown).toContain("| License | 6/10 | 2.5 | partial |")
    expect(markdown).toContain("| Check | Score | Weight | Why |")
    expect(markdown).toContain("**Weighted score:** 9.2/10")
  })

  it("marks a check missing from the weight table as a weight-1 fallback, distinct from a real weight of 1", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [{ name: "Unmapped-Check", score: 4, reason: "no known weight", details: [] }],
      weightedAverage: 4,
      weights: { "Some-Other-Check": 7.5 },
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).toContain("| Unmapped-Check | 4/10 | 1 (fallback) | no known weight |")
  })

  it("shows every evaluated check as a weight-1 fallback when the live weight table itself is entirely unavailable", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [{ name: "License", score: 10, reason: "clean", details: [] }],
      weightedAverage: 10,
      weights: undefined,
      weightsUnavailableReason: "gh CLI is not installed.",
      provenance: provenance(),
    })
    expect(markdown).toContain("| License | 10/10 | 1 (fallback) | clean |")
  })

  it("labels the aggregate score as weighted, not a bare average, and renders its formula", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [],
      weightedAverage: 7.25,
      weights: {},
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).toContain("**Weighted score:** 7.3/10")
    expect(markdown).toContain("Σ(score × weight) / Σ(weight)")
    expect(markdown).not.toMatch(/average score/i)
  })

  it("reports N/A for the weighted score when nothing was evaluated", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [],
      weightedAverage: undefined,
      weights: undefined,
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).toContain("**Weighted score:** N/A (no checks were evaluated)")
    // No fetch was ever attempted in this case (see
    // checks/openssf-scorecard.ts's own "skip the fetch when there's
    // nothing to weight" short-circuit): claiming live-fetched weights
    // were used here would be false.
    expect(markdown).not.toContain("live-fetched per-check weights")
    expect(markdown).not.toContain("fell back to equal weighting")
  })

  it("notes the equal-weighting fallback and its reason when the live weight fetch failed", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [],
      weightedAverage: 5,
      weights: undefined,
      weightsUnavailableReason: "gh CLI is not installed.",
      provenance: provenance(),
    })
    expect(markdown).toContain("fell back to equal weighting")
    expect(markdown).toContain("gh CLI is not installed.")
  })

  it("omits the equal-weighting fallback note when the live weight fetch succeeded", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [],
      weightedAverage: 5,
      weights: {},
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).not.toContain("fell back to equal weighting")
    expect(markdown).toContain("live-fetched per-check weights")
  })

  it("renders the date, repo, and commit provenance fields", () => {
    const markdown = renderScorecardMarkdown({
      repo: "acme/widgets",
      generatedAt: "2026-03-15T09:30:00.000Z",
      results: [],
      weightedAverage: undefined,
      weights: undefined,
      weightsUnavailableReason: undefined,
      provenance: provenance({
        date: "2026-03-15T09:30:00.000Z",
        repo: { name: "acme/widgets", commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
        scorecard: { version: "1.2.3", commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
      }),
    })
    expect(markdown).toContain("**Date:** 2026-03-15T09:30:00.000Z")
    expect(markdown).toContain(
      "**Repository:** `acme/widgets` @ `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`",
    )
    expect(markdown).toContain(
      "**Evaluator version:** `repo-contract@1.2.3` @ `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`",
    )
  })

  it("labels the evaluator version as its own, not the upstream scorecard binary's", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [],
      weightedAverage: undefined,
      weights: undefined,
      weightsUnavailableReason: undefined,
      provenance: provenance(),
    })
    expect(markdown).toMatch(/not.*the upstream `scorecard` binary's/)
  })

  describe("the official OpenSSF Scorecard result", () => {
    const official = {
      date: "2026-11-03T09:59:04Z",
      score: 7,
      scorecardVersion: "v5.6.0",
      commit: "8d5e308aba3a264ff061f2a61062977eb9d71ff9",
      checks: [
        {
          name: "Code-Review",
          score: 0,
          reason: "Found 0/5 approved changesets -- score normalized to 0",
        },
        { name: "Packaging", score: -1, reason: "packaging workflow not detected" },
        { name: "License", score: 10, reason: "license file detected" },
      ],
    }
    const render = (extra: Record<string, unknown>): string =>
      renderScorecardMarkdown({
        repo: "MaverickCER/repo-contract",
        generatedAt: "2026-11-04T00:00:00.000Z",
        results: [
          { name: "Code-Review", score: 10, reason: "local says reviewed", details: [] },
          { name: "License", score: 10, reason: "MIT", details: [] },
        ],
        weightedAverage: 10,
        weights: { "Code-Review": 7.5, License: 2.5 },
        weightsUnavailableReason: undefined,
        provenance: provenance(),
        ...extra,
      })

    it("comes before this repository's own evaluation, with the version, commit and date it was produced from", () => {
      const markdown = render({ official })
      const officialAt = markdown.indexOf("## Official OpenSSF Scorecard result")
      expect(officialAt).toBeGreaterThan(-1)
      expect(officialAt).toBeLessThan(markdown.indexOf("## Checks\n"))
      expect(markdown).toContain("- **Official score:** 7.0/10")
      expect(markdown).toContain("- **Scorecard version:** `v5.6.0`")
      expect(markdown).toContain(
        "- **Commit evaluated:** `8d5e308aba3a264ff061f2a61062977eb9d71ff9`",
      )
      expect(markdown).toContain("- **Evaluated on:** 2026-11-03T09:59:04Z")
      expect(markdown).toContain(
        "[scorecard.dev viewer](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/repo-contract)",
      )
    })

    it("lists every official check beside this evaluation's score for it", () => {
      const markdown = render({ official })
      expect(markdown).toContain("| Check | Official | This evaluation | Official reason |")
      expect(markdown).toContain(
        "| Code-Review | 0/10 | 10/10 | Found 0/5 approved changesets -- score normalized to 0 |",
      )
      expect(markdown).toContain(
        "| Packaging | N/A | not evaluated | packaging workflow not detected |",
      )
      expect(markdown).toContain("| License | 10/10 | 10/10 | license file detected |")
    })

    it("explains every check where the two disagree, with both reasons", () => {
      const markdown = render({ official })
      expect(markdown).toContain("## Where the two differ")
      expect(markdown).toContain(
        "- **Code-Review:** official 0/10, this evaluation 10/10. Official: Found 0/5 approved changesets -- score normalized to 0. This evaluation: local says reviewed.",
      )
      expect(markdown).not.toContain("- **License:** official")
    })

    it("says when the two agree on every check both scored", () => {
      const markdown = render({
        official: {
          ...official,
          checks: [{ name: "License", score: 10, reason: "license file detected" }],
        },
      })
      expect(markdown).toContain("The two agree on every check both of them scored.")
    })

    it("says the official result could not be fetched, and why, instead of leaving it out silently", () => {
      const markdown = render({ officialUnavailableReason: "HTTP 404" })
      expect(markdown).toContain("## Official OpenSSF Scorecard result")
      expect(markdown).toContain("The official result could not be fetched for this run: HTTP 404.")
      expect(markdown).not.toContain("## Where the two differ")
    })

    it("tells the reader to trust the official score over this evaluation", () => {
      const markdown = render({ official })
      expect(markdown).toContain("When the two disagree, the official result is the one to cite.")
    })
  })

  describe("checks not evaluated", () => {
    const render = (names: readonly string[]): string =>
      renderScorecardMarkdown({
        repo: "owner/repo",
        generatedAt: "2026-01-01T00:00:00.000Z",
        results: names.map((name) => ({ name, score: 10, reason: "r", details: [] })),
        weightedAverage: 10,
        weights: undefined,
        weightsUnavailableReason: undefined,
        provenance: provenance(),
      })

    it("is computed from the upstream check list, so a check is never silently missing from both lists", () => {
      const markdown = render(["License"])
      const section = markdown.slice(markdown.indexOf("## Checks not evaluated"))
      expect(section).toContain("- **Binary-Artifacts**")
      expect(section).toContain("- **Dependency-Update-Tool**")
      expect(section).not.toContain("- **License**")
    })

    it("no longer claims that no SBOM is generated: this repository commits two", () => {
      const markdown = render([])
      expect(markdown).not.toContain("no Software Bill of Materials is currently generated")
      expect(markdown).toContain("docs/sbom.production.cdx.json")
    })

    it("no longer links a README that does not exist", () => {
      expect(render([])).not.toContain("scripts/openssf-scorecard/README.md")
    })
  })
})
