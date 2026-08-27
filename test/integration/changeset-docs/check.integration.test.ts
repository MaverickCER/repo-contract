import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runChangesetDocsCheck } from "../../../scripts/changeset-docs/check.js"

/**
 * The complete real path: a real scratch git repository, a real `git diff` against a real base
 * branch, through to evidence -- no subprocess spawned for the check itself, matching
 * test/integration/api-contract/check.integration.test.ts's own in-process convention.
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
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-changeset-docs-integration-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture-pkg", version: "0.1.0" }),
    "utf8",
  )
  await mkdir(path.join(root, ".changeset"), { recursive: true })
  commitAll("initial commit on main")
  // `-B` (create-or-reset, then switch) rather than assuming `git init`'s own
  // default branch name is "main" -- it isn't, on a host with a different
  // `init.defaultBranch`, which would otherwise leave every `runChangesetDocsCheck` call below
  // diffing against an unresolvable ref (scripts/diff-files.ts swallows that failure and returns
  // an empty file list), making every assertion in this file pass vacuously instead of exercising
  // the real diff. See test/unit/diff-files.test.ts's own host-independent pattern.
  git("checkout", "-q", "-B", "main")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("runChangesetDocsCheck -- full real path", () => {
  it("creates placeholder rows for every file changed on a feature branch relative to its base", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src.txt"), "real source change\n", "utf8")
    await writeFile(path.join(root, "docs.txt"), "doc update\n", "utf8")
    commitAll("feature work")

    const evidence = await runChangesetDocsCheck(root, "main")

    expect(evidence.rows).toHaveLength(2)
    expect(evidence.allDescribed).toBe(false)
    expect(evidence.rows.map((r) => r.path).sort()).toEqual(["docs.txt", "src.txt"])
    expect(evidence.changesetPath).toBeDefined()

    const content = await readFile(path.join(root, evidence.changesetPath ?? ""), "utf8")
    expect(content).toContain("### Changed Files")
    expect(content).toContain("_(needs description)_")
  }, 30_000)

  it("passes with allDescribed=true once every row has a real description, and preserves it across a rerun", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src.txt"), "real source change\n", "utf8")
    commitAll("feature work")

    const first = await runChangesetDocsCheck(root, "main")
    expect(first.allDescribed).toBe(false)

    const changesetPath = path.join(root, first.changesetPath ?? "")
    const filled = (await readFile(changesetPath, "utf8")).replace(
      "_(needs description)_",
      "Adds a real source change.",
    )
    await writeFile(changesetPath, filled, "utf8")

    const second = await runChangesetDocsCheck(root, "main")
    expect(second.allDescribed).toBe(true)
    expect(second.rows[0]?.description).toBe("Adds a real source change.")

    // A third run with no further diff changes must not disturb the filled-in description.
    const third = await runChangesetDocsCheck(root, "main")
    expect(third.rows[0]?.description).toBe("Adds a real source change.")
  }, 30_000)

  it("reports zero rows and allDescribed=true when nothing changed relative to the base", async () => {
    git("checkout", "-q", "-b", "feature")

    const evidence = await runChangesetDocsCheck(root, "main")

    expect(evidence.rows).toEqual([])
    expect(evidence.allDescribed).toBe(true)
    expect(evidence.changesetPath).toBeUndefined()
  }, 30_000)

  it("drops a row once the change is reverted back to the diff base, on a real git branch, and cleans up the file it created from nothing", async () => {
    git("checkout", "-q", "-b", "feature")
    await writeFile(path.join(root, "src.txt"), "real source change\n", "utf8")
    commitAll("feature work")

    const first = await runChangesetDocsCheck(root, "main")
    expect(first.rows).toHaveLength(1)
    expect(first.changesetPath).toBeDefined()
    const changesetPath = path.join(root, first.changesetPath ?? "")
    await expect(readFile(changesetPath, "utf8")).resolves.toContain("src.txt")

    // `src.txt` never existed on `main`, so removing it on `feature` is a genuine revert back to
    // the diff base -- `git diff main...HEAD` reports zero changed files afterward.
    await rm(path.join(root, "src.txt"), { force: true })
    commitAll("revert src.txt back to base")

    const second = await runChangesetDocsCheck(root, "main")
    expect(second.rows).toEqual([])
    // The changeset file was created from nothing by this mechanism (created-frontmatter: true)
    // and, once nothing of value remains, is deleted entirely rather than left behind empty.
    expect(second.changesetPath).toBeUndefined()
    await expect(readFile(changesetPath, "utf8")).rejects.toThrow(/ENOENT/)
  }, 30_000)

  it("carries a description over to the new path via a real `git mv`, through real git diff -M output", async () => {
    // The original file must already exist on `main` for git's rename detection to have a real
    // deletion to pair the rename against -- a file created and renamed entirely within the same
    // feature branch, relative to a base that never had it, can only ever show as a plain "add,"
    // never a rename, regardless of the intermediate commits (a two-tree diff compares only the
    // base and HEAD trees, never the commits in between). The file also needs to be large enough,
    // and the edit small enough, to stay above git's default 50% rename-similarity threshold --
    // git's own heuristic degrades to a plain delete+add below that, exactly the "rename detection
    // is heuristic" caveat this test exists to respect rather than paper over.
    const original = ["line one", "line two", "line three", "line four", "line five"].join("\n")
    await writeFile(path.join(root, "src.txt"), `${original}\n`, "utf8")
    commitAll("add src.txt to main")

    git("checkout", "-q", "-b", "feature")
    const modified = original.replace("line one", "line one EDITED")
    await writeFile(path.join(root, "src.txt"), `${modified}\n`, "utf8")
    commitAll("modify src.txt")

    const first = await runChangesetDocsCheck(root, "main")
    expect(first.rows).toHaveLength(1)
    const changesetPath = path.join(root, first.changesetPath ?? "")
    const filled = (await readFile(changesetPath, "utf8")).replace(
      "_(needs description)_",
      "Adds a real source change.",
    )
    await writeFile(changesetPath, filled, "utf8")

    git("mv", "src.txt", "renamed-src.txt")
    commitAll("rename src.txt")

    const second = await runChangesetDocsCheck(root, "main")

    expect(second.rows).toHaveLength(1)
    expect(second.rows[0]?.path).toBe("renamed-src.txt")
    expect(second.rows[0]?.changeKind).toBe("renamed")
    expect(second.rows[0]?.renamedFrom).toBe("src.txt")
    expect(second.rows[0]?.description).toBe("Adds a real source change.")

    const content = await readFile(changesetPath, "utf8")
    expect(content).toContain("- **renamed-src.txt** (renamed from `src.txt`")
  }, 30_000)
})
