import { describe, expect, it } from "vitest"
import {
  declaredLevelFromCommits,
  parseCommitLevel,
} from "../../../scripts/api-contract/conventional-commits.js"

/**
 * Pins scripts/api-contract/conventional-commits.ts against the Conventional Commits 1.0.0
 * spec's own worked examples -- the api-contract gate's required-vs-declared comparison is only
 * as trustworthy as this bump derivation, and ADR 0009 makes "agrees with release-please's bump
 * logic" a stated invariant.
 */

describe("parseCommitLevel -- Conventional Commits 1.0.0 worked examples", () => {
  it.each([
    ["feat: allow provided config object to extend other configs", "minor"],
    ["feat(lang): add Polish language", "minor"],
    ["fix: prevent racing of requests", "patch"],
    ["perf: avoid re-parsing the config on every call", "patch"],
    ["docs: correct spelling of CHANGELOG", "none"],
    ["refactor: extract the header parser", "none"],
    ["chore: bump deps", "none"],
    ["ci: run the contract on windows too", "none"],
  ] as const)("%j -> %s", (message, expected) => {
    expect(parseCommitLevel(message)).toBe(expected)
  })

  it("treats a `!` before the colon as breaking regardless of the type", () => {
    expect(parseCommitLevel("feat!: send an email when a product is shipped")).toBe("major")
    expect(parseCommitLevel("feat(api)!: send an email when a product is shipped")).toBe("major")
    expect(parseCommitLevel("chore!: drop support for Node 6")).toBe("major")
    expect(parseCommitLevel("refactor(core)!: remove the legacy path")).toBe("major")
  })

  it("treats a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer as breaking", () => {
    expect(
      parseCommitLevel(
        "feat: allow config to extend other configs\n\nBREAKING CHANGE: `extends` key now used for extending configs.",
      ),
    ).toBe("major")
    expect(
      parseCommitLevel("fix: correct minor typos\n\nBREAKING-CHANGE: drops the old option."),
    ).toBe("major")
  })

  it("does not treat a mid-body mention of breaking changes as the footer token", () => {
    expect(
      parseCommitLevel("fix: guard against a breaking change in the parser\n\nJust a normal body."),
    ).toBe("patch")
  })

  it("declares nothing for a non-conforming header", () => {
    for (const message of [
      "Merge branch 'main' into feature",
      "wip",
      "Fix: capitalised type is not config-conventional",
      "update readme",
      "feat add polish language", // missing colon
      "(scope): no type",
    ]) {
      expect(parseCommitLevel(message)).toBe("none")
    }
  })

  it("accepts an empty scope and a scope containing punctuation, but not a newline", () => {
    expect(parseCommitLevel("feat(): still a feature")).toBe("minor")
    expect(parseCommitLevel("fix(api/v2): still a fix")).toBe("patch")
    expect(parseCommitLevel("feat(unclosed: subject")).toBe("none")
  })
})

describe("declaredLevelFromCommits", () => {
  it("returns the largest bump across the set", () => {
    expect(
      declaredLevelFromCommits([
        "docs: tidy the readme",
        "fix: prevent a crash",
        "feat: add a flag",
      ]),
    ).toBe("minor")
  })

  it("is `none` for an empty set or a set that declares nothing releasable", () => {
    expect(declaredLevelFromCommits([])).toBe("none")
    expect(declaredLevelFromCommits(["chore: deps", "ci: tweak"])).toBe("none")
  })

  it("lets a single breaking commit dominate", () => {
    expect(declaredLevelFromCommits(["fix: a", "feat!: b", "docs: c"])).toBe("major")
  })

  it("counts a PR title passed in as one of the messages", () => {
    expect(declaredLevelFromCommits(["chore: nothing here", "feat: added via the PR title"])).toBe(
      "minor",
    )
  })
})
