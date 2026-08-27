import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runAdrGovernanceCheck } from "../../../scripts/adr-governance/check.js"

/**
 * The complete real path: a real scratch git repository, a real `git diff` against a real base
 * branch, a real `specs/decisions/` directory to resolve references against, through to evidence --
 * no subprocess spawned for the check itself, matching
 * test/integration/changeset-docs/check.integration.test.ts's own in-process convention.
 */

let root: string

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function commitAll(message: string): void {
  git("add", "-A")
  git("commit", "-m", message)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-adr-governance-integration-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  await mkdir(path.join(root, "src/execution"), { recursive: true })
  await mkdir(path.join(root, "src/policy"), { recursive: true })
  await mkdir(path.join(root, "specs/decisions"), { recursive: true })
  await mkdir(path.join(root, ".changeset"), { recursive: true })
  await writeFile(
    path.join(root, "specs/decisions/0001-fixture-decision.md"),
    "# 0001: A fixture decision\n",
    "utf8",
  )
  commitAll("initial commit on main")
  // `-B` (create-or-reset, then switch) rather than assuming `git init`'s own
  // default branch name is "main" -- it isn't, on a host with a different
  // `init.defaultBranch`, which would otherwise leave every `runAdrGovernanceCheck(root, "main")`
  // call below diffing against an unresolvable ref (scripts/diff-files.ts swallows that failure
  // and returns an empty file list), making every assertion in this file pass vacuously instead
  // of exercising the real diff. See test/unit/diff-files.test.ts's own host-independent pattern.
  git("checkout", "-q", "-B", "main")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("runAdrGovernanceCheck -- full real path", () => {
  it("is unsatisfied when a governed file changes with no ADR touched and no changeset reference", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src/execution/spawn-check.ts"), "// change\n", "utf8")
    commitAll("touch execution engine")

    const evidence = await runAdrGovernanceCheck(root, "main")

    expect(evidence.governedFilesTouched).toEqual(["src/execution/spawn-check.ts"])
    expect(evidence.adrFilesTouched).toEqual([])
    expect(evidence.satisfied).toBe(false)
  }, 30_000)

  it("is satisfied when the same change also touches specs/decisions/, even just amending an existing ADR", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src/policy/run-policies.ts"), "// change\n", "utf8")
    await writeFile(
      path.join(root, "specs/decisions/0001-fixture-decision.md"),
      "# 0001: A fixture decision\n\namended\n",
      "utf8",
    )
    commitAll("touch policy engine and amend an ADR")

    const evidence = await runAdrGovernanceCheck(root, "main")

    expect(evidence.governedFilesTouched).toEqual(["src/policy/run-policies.ts"])
    expect(evidence.adrFilesTouched).toEqual(["specs/decisions/0001-fixture-decision.md"])
    expect(evidence.satisfied).toBe(true)
  }, 30_000)

  it.each(["ADR 0001", "ADR-0001", "adr0001"])(
    "is satisfied by a valid changeset reference in the form %j, resolved against a real ADR file",
    async (reference) => {
      git("checkout", "-q", "-b", "feature")
      await writeFile(path.join(root, "src/execution/spawn-check.ts"), "// change\n", "utf8")
      await writeFile(
        path.join(root, ".changeset/fixture.md"),
        `---\n"pkg": patch\n---\n\nSee ${reference} for the reasoning.\n`,
        "utf8",
      )
      commitAll("touch execution engine and reference an ADR")

      const evidence = await runAdrGovernanceCheck(root, "main")

      expect(evidence.referencedAdrNumbers).toEqual(["0001"])
      expect(evidence.resolvedAdrNumbers).toEqual(["0001"])
      expect(evidence.satisfied).toBe(true)
    },
    30_000,
  )

  it("is unsatisfied when the changeset references a number with no corresponding ADR file -- proving cross-validation, not just regex-shape", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src/execution/spawn-check.ts"), "// change\n", "utf8")
    await writeFile(
      path.join(root, ".changeset/fixture.md"),
      '---\n"pkg": patch\n---\n\nSee ADR 9999 for the reasoning.\n',
      "utf8",
    )
    commitAll("touch execution engine and reference a nonexistent ADR")

    const evidence = await runAdrGovernanceCheck(root, "main")

    expect(evidence.referencedAdrNumbers).toEqual(["9999"])
    expect(evidence.resolvedAdrNumbers).toEqual([])
    expect(evidence.satisfied).toBe(false)
  }, 30_000)

  it("is satisfied trivially when nothing under src/execution/ or src/policy/ changed", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "README.md"), "unrelated change\n", "utf8")
    commitAll("unrelated change")

    const evidence = await runAdrGovernanceCheck(root, "main")

    expect(evidence.governedFilesTouched).toEqual([])
    expect(evidence.satisfied).toBe(true)
  }, 30_000)
})
