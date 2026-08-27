import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { listChangedFiles } from "../../scripts/diff-files.js"

let root: string

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function commitAll(message: string): void {
  git("add", "-A")
  git("commit", "-m", message)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-diff-files-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("listChangedFiles", () => {
  it("returns an empty list when the base ref doesn't resolve", async () => {
    await writeFile(path.join(root, "a.txt"), "content", "utf8")
    commitAll("initial")

    const files = await listChangedFiles(root, "does-not-exist")
    expect(files).toEqual([])
  })

  it("detects an added file", async () => {
    await writeFile(path.join(root, "a.txt"), "content", "utf8")
    commitAll("base")
    git("branch", "base")

    await writeFile(path.join(root, "b.txt"), "new file\nsecond line\n", "utf8")
    commitAll("add b")

    const files = await listChangedFiles(root, "base")
    expect(files).toEqual([{ path: "b.txt", changeKind: "added", linesAdded: 2, linesRemoved: 0 }])
  })

  it("detects a modified file with accurate line counts", async () => {
    await writeFile(path.join(root, "a.txt"), "line1\nline2\nline3\n", "utf8")
    commitAll("base")
    git("branch", "base")

    await writeFile(path.join(root, "a.txt"), "line1\nchanged\nline3\nline4\n", "utf8")
    commitAll("modify a")

    const files = await listChangedFiles(root, "base")
    expect(files).toEqual([
      { path: "a.txt", changeKind: "modified", linesAdded: 2, linesRemoved: 1 },
    ])
  })

  it("detects a deleted file", async () => {
    await writeFile(path.join(root, "a.txt"), "content\n", "utf8")
    commitAll("base")
    git("branch", "base")

    await rm(path.join(root, "a.txt"))
    commitAll("delete a")

    const files = await listChangedFiles(root, "base")
    expect(files).toEqual([
      { path: "a.txt", changeKind: "deleted", linesAdded: 0, linesRemoved: 1 },
    ])
  })

  it("detects a rename and reports renamedFrom", async () => {
    await writeFile(path.join(root, "old.txt"), "content\nmore content\nfinal line\n", "utf8")
    commitAll("base")
    git("branch", "base")

    await rm(path.join(root, "old.txt"))
    await writeFile(path.join(root, "new.txt"), "content\nmore content\nfinal line\n", "utf8")
    commitAll("rename old to new")

    const files = await listChangedFiles(root, "base")
    expect(files).toEqual([
      {
        path: "new.txt",
        changeKind: "renamed",
        renamedFrom: "old.txt",
        linesAdded: 0,
        linesRemoved: 0,
      },
    ])
  })

  it("returns a non-ASCII pathname verbatim, not git's octal-escaped quoted form", async () => {
    await writeFile(path.join(root, "a.txt"), "content\n", "utf8")
    commitAll("base")
    git("branch", "base")

    await writeFile(path.join(root, "café-señor.txt"), "unicode name\n", "utf8")
    commitAll("add unicode file")

    const files = await listChangedFiles(root, "base")
    expect(files.map((f) => f.path)).toEqual(["café-señor.txt"])
  })

  it("excludes .changeset/** from the results", async () => {
    await writeFile(path.join(root, "a.txt"), "content\n", "utf8")
    commitAll("base")
    git("branch", "base")

    await mkdir(path.join(root, ".changeset"), { recursive: true })
    await writeFile(path.join(root, ".changeset", "repo-contract.md"), "---\n---\n\nnote\n", "utf8")
    await writeFile(path.join(root, "src.txt"), "real change\n", "utf8")
    commitAll("touch changeset and src")

    const files = await listChangedFiles(root, "base")
    expect(files.map((f) => f.path)).toEqual(["src.txt"])
  })
})
