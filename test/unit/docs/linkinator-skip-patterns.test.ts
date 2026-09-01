import { describe, expect, it } from "vitest"
import { LINKINATOR_SKIP_PATTERNS } from "../../../scripts/check-docs.mjs"

/**
 * scripts/check-docs.mjs exempts a few URL shapes from linkinator's live crawl
 * (see that file's own comment for why each is unverifiable-by-construction).
 * linkinator applies every `--skip` value as a bare `new RegExp(value)` with no
 * flags, tested against the full href -- these cases pin that the changelog
 * release-URL exemption stays scoped to this repo and can't be widened by a
 * spoofed host or a query-string injection.
 */

// Mirror linkinator's own matcher: `new RegExp(x).test(href)`, no flags.
function isSkipped(href: string): boolean {
  return LINKINATOR_SKIP_PATTERNS.some((pattern) => new RegExp(pattern).test(href))
}

describe("LINKINATOR_SKIP_PATTERNS -- changelog release URLs", () => {
  it.each([
    "https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.1.0...repo-contract-v0.1.1",
    "https://github.com/maverickcer/repo-contract/releases/tag/repo-contract-v0.1.0",
    "http://github.com/maverickcer/repo-contract/compare/a...b",
    "https://github.com/MAVERICKCER/repo-contract/compare/a...b",
  ])("skips this repo's own compare/tag link regardless of owner casing: %s", (href) => {
    expect(isSkipped(href)).toBe(true)
  })

  it.each([
    // another owner's fork, or a typo'd owner -- must still be crawled
    "https://github.com/someone-else/repo-contract/compare/a...b",
    "https://github.com/maverikcer/repo-contract/compare/a...b",
    // this owner, but a different repo
    "https://github.com/maverickcer/other-repo/compare/a...b",
    // spoofed host / path smuggled into a query string
    "https://notgithub.com/maverickcer/repo-contract/compare/a...b",
    "https://github.com.evil.example/maverickcer/repo-contract/compare/a...b",
    "https://evil.example/?x=github.com/maverickcer/repo-contract/compare/a",
    // real, verifiable links on this repo -- never skipped
    "https://github.com/maverickcer/repo-contract/issues/1",
    "https://github.com/maverickcer/repo-contract/commit/abc1234",
  ])("does not skip: %s", (href) => {
    expect(isSkipped(href)).toBe(false)
  })
})
