import { describe, expect, it } from "vitest"
import {
  scoreCodeReview,
  scoreContributors,
  scoreMaintained,
} from "../../../../scripts/openssf-scorecard/github-checks.js"

const DAY = 86_400_000
const NOW = Date.parse("2026-11-04T00:00:00Z")
const daysAgo = (days: number): string => new Date(NOW - days * DAY).toISOString()

describe("scoreCodeReview", () => {
  it("scores what actually happened to merged pull requests, not what branch protection says should happen", () => {
    // An admin merge bypasses a required review: the rule is configured, the change was not reviewed.
    const result = scoreCodeReview(
      [
        { number: 1, author: "maintainer", approvers: [] },
        { number: 2, author: "maintainer", approvers: [] },
      ],
      1,
    )
    expect(result.score).toBe(0)
    expect(result.reason).toBe(
      "0 of 2 recently merged pull request(s) had an approving review from someone other than their author. Branch protection requires 1 approving review(s); a merge that bypasses that rule counts as unreviewed here, as it does upstream.",
    )
  })

  it("does not count the author approving their own pull request", () => {
    const result = scoreCodeReview([{ number: 1, author: "a", approvers: ["a"] }], 0)
    expect(result.score).toBe(0)
  })

  it("scores the share of reviewed pull requests, rounded down as upstream's proportional score is", () => {
    const result = scoreCodeReview(
      [
        { number: 1, author: "a", approvers: ["b"] },
        { number: 2, author: "a", approvers: ["c", "a"] },
        { number: 3, author: "a", approvers: [] },
      ],
      1,
    )
    expect(result.score).toBe(6)
    expect(result.reason.startsWith("2 of 3 recently merged")).toBe(true)
  })

  it("scores 10 when every merged pull request was approved by someone else", () => {
    expect(scoreCodeReview([{ number: 1, author: "a", approvers: ["b"] }], 1).score).toBe(10)
  })

  it("says so instead of scoring when nothing has been merged yet", () => {
    const result = scoreCodeReview([], 1)
    expect(result.score).toBe("not-applicable")
    expect(result.reason).toBe("No merged pull requests were found to assess.")
  })

  it("names the pull requests that were merged without an approving review", () => {
    const result = scoreCodeReview(
      [
        { number: 7, author: "a", approvers: [] },
        { number: 8, author: "a", approvers: ["b"] },
      ],
      1,
    )
    expect(result.details).toEqual(["Merged without an approving review from someone else: #7"])
  })
})

describe("scoreMaintained", () => {
  it("scores a repository younger than 90 days as 0, as upstream does, instead of leaving it out of the weighted score", () => {
    const result = scoreMaintained(
      { created_at: daysAgo(69), pushed_at: daysAgo(0), archived: false },
      NOW,
    )
    expect(result.score).toBe(0)
    expect(result.reason).toBe(
      "Repository is 69 day(s) old. Upstream scores a repository created within the last 90 days as 0, so this evaluation does too.",
    )
  })

  it("scores an archived repository as 0", () => {
    expect(
      scoreMaintained({ created_at: daysAgo(400), pushed_at: daysAgo(1), archived: true }, NOW)
        .score,
    ).toBe(0)
  })

  it("scores a recent push as 10 once the repository is old enough", () => {
    expect(
      scoreMaintained({ created_at: daysAgo(120), pushed_at: daysAgo(3), archived: false }, NOW)
        .score,
    ).toBe(10)
  })

  it("loses a point for each full week without a push", () => {
    expect(
      scoreMaintained({ created_at: daysAgo(120), pushed_at: daysAgo(15), archived: false }, NOW)
        .score,
    ).toBe(8)
    expect(
      scoreMaintained({ created_at: daysAgo(400), pushed_at: daysAgo(200), archived: false }, NOW)
        .score,
    ).toBe(0)
  })
})

describe("scoreContributors", () => {
  it("scores proportionally toward upstream's three-organization bar instead of all-or-nothing", () => {
    expect(scoreContributors(["a"]).score).toBe(3)
    expect(scoreContributors(["a", "b"]).score).toBe(6)
    expect(scoreContributors(["a", "b", "c"]).score).toBe(10)
    expect(scoreContributors(["a", "b", "c", "d"]).score).toBe(10)
    expect(scoreContributors([]).score).toBe(0)
  })

  it("says that it counts people, not the organizations upstream counts", () => {
    expect(scoreContributors(["a"]).reason).toBe(
      "1 distinct human contributor(s) found. Upstream counts the organizations contributors belong to; this evaluation counts people, which can only over-count organizations.",
    )
    expect(scoreContributors(["a"]).details).toEqual(["Contributors: a"])
  })
})
