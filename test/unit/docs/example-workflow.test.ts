import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * examples/ci/contract.yml is copied by adopters, so its action pins must be ones this repository
 * runs itself. The pin-sync workflow keeps .github/workflows/ current; this test makes the example
 * fail as soon as it falls behind them.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const example = readFileSync(path.join(root, "examples/ci/contract.yml"), "utf8")
const workflowsDir = path.join(root, ".github/workflows")
const workflows = readdirSync(workflowsDir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => readFileSync(path.join(workflowsDir, file), "utf8"))
  .join("\n")

const USES = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm
const PINNED = /^([\w.-]+\/[\w./-]+)@([0-9a-f]{40})$/

/**
 * @param text - A workflow file.
 * @returns Each `uses:` reference with the comment after it.
 */
function uses(text: string): { readonly ref: string; readonly comment: string }[] {
  return [...text.matchAll(USES)].map((match) => ({
    ref: match[1] ?? "",
    comment: (match[2] ?? "").trim(),
  }))
}

/**
 * @param text - A workflow file.
 * @returns One message per `uses:` that is not pinned by a full SHA with a `# v` version comment.
 */
function unpinned(text: string): string[] {
  return uses(text)
    .filter(({ ref, comment }) => !PINNED.test(ref) || !/^# v\d/.test(comment))
    .map(({ ref }) => ref)
}

describe("examples/ci/contract.yml", () => {
  it("uses actions", () => {
    expect(uses(example).length).toBeGreaterThan(3)
  })

  it("pins every action by a full commit SHA with its version in a comment", () => {
    expect(unpinned(example)).toEqual([])
  })

  it("pins only SHAs this repository's own workflows use", () => {
    const own = new Set(uses(workflows).map(({ ref }) => ref))
    expect(uses(example).filter(({ ref }) => !own.has(ref))).toEqual([])
  })

  it("rejects a tag or a short SHA, so the probe can fail", () => {
    expect(
      unpinned(
        ["- uses: actions/checkout@v4", "- uses: actions/checkout@3d3c42e # v7.0.1"].join("\n"),
      ),
    ).toEqual(["actions/checkout@v4", "actions/checkout@3d3c42e"])
  })
})
