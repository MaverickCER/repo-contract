import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  applyChangesetDocs,
  parseExistingDescriptions,
  renderRow,
} from "../../../scripts/changeset-docs/table-manager.js"
import type { RawDiffFile } from "../../../scripts/diff-files.js"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-table-manager-"))
  await mkdir(path.join(root, ".changeset"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function file(overrides: Partial<RawDiffFile> = {}): RawDiffFile {
  return {
    path: "src/foo.ts",
    changeKind: "modified",
    linesAdded: 4,
    linesRemoved: 1,
    ...overrides,
  }
}

describe("applyChangesetDocs", () => {
  it("creates the section with placeholder rows for every changed file when none exists yet", async () => {
    const result = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [
        file(),
        file({ path: "src/bar.ts", changeKind: "added", linesAdded: 10, linesRemoved: 0 }),
      ],
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((r) => r.description === undefined)).toBe(true)
    expect(result.changesetPath).toBe(path.join(".changeset", "repo-contract.md"))

    const content = await readFile(path.join(root, result.changesetPath ?? ""), "utf8")
    expect(content).toContain('"pkg": patch')
    expect(content).toContain("### Changed Files")
    expect(content).toContain("- **src/foo.ts** (modified, +4/-1): _(needs description)_")
    expect(content).toContain("- **src/bar.ts** (added, +10/-0): _(needs description)_")
  })

  it("is idempotent: rerunning with the same diff produces no write on the second pass", async () => {
    const input = { root, packageName: "pkg", files: [file()] }
    const first = await applyChangesetDocs(input)
    const before = await readFile(path.join(root, first.changesetPath ?? ""), "utf8")

    await applyChangesetDocs(input)
    const after = await readFile(path.join(root, first.changesetPath ?? ""), "utf8")

    expect(after).toBe(before)
  })

  it("drops a row for a file that's no longer part of the diff, even if it had a human-written description, while other rows remain", async () => {
    const created = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [
        file(),
        file({ path: "src/bar.ts", changeKind: "added", linesAdded: 2, linesRemoved: 0 }),
      ],
    })
    const targetPath = path.join(root, created.changesetPath ?? "")
    const withDescription = (await readFile(targetPath, "utf8")).replace(
      "- **src/foo.ts** (modified, +4/-1): _(needs description)_",
      "- **src/foo.ts** (modified, +4/-1): Fixed the foo bug.",
    )
    await writeFile(targetPath, withDescription, "utf8")

    const reverted = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [file({ path: "src/bar.ts", changeKind: "added", linesAdded: 2, linesRemoved: 0 })],
    })

    expect(reverted.rows).toHaveLength(1)
    expect(reverted.rows[0]?.path).toBe("src/bar.ts")
    const content = await readFile(targetPath, "utf8")
    expect(content).not.toContain("Fixed the foo bug.")
    expect(content).not.toContain("src/foo.ts")
    expect(content).toContain("src/bar.ts")
  })

  it("removes the file entirely when a revert leaves nothing of value in a file table-manager itself created", async () => {
    const created = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })
    const targetPath = created.changesetPath ?? ""

    const reverted = await applyChangesetDocs({ root, packageName: "pkg", files: [] })

    expect(reverted).toEqual({ rows: [], changesetPath: undefined })
    await expect(readFile(path.join(root, targetPath), "utf8")).rejects.toThrow()
  })

  it("keeps the file (frontmatter-only) when a revert leaves nothing of value in a file it did not create itself", async () => {
    await writeFile(
      path.join(root, ".changeset", "from-human.md"),
      '---\n"pkg": minor\n---\n\nHuman-declared level, no prose.\n',
      "utf8",
    )
    const created = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })
    const targetPath = created.changesetPath ?? ""
    const withDescription = (await readFile(path.join(root, targetPath), "utf8")).replace(
      "Human-declared level, no prose.\n\n",
      "",
    )
    await writeFile(path.join(root, targetPath), withDescription, "utf8")

    const reverted = await applyChangesetDocs({ root, packageName: "pkg", files: [] })

    expect(reverted.changesetPath).toBe(targetPath)
    const content = await readFile(path.join(root, targetPath), "utf8")
    expect(content).toContain('"pkg": minor')
    expect(content).not.toContain("### Changed Files")
  })

  it("preserves a filled-in description across a rerun where an unrelated new file also changed", async () => {
    const created = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })
    const targetPath = path.join(root, created.changesetPath ?? "")
    const withDescription = (await readFile(targetPath, "utf8")).replace(
      "_(needs description)_",
      "Fixed the foo bug.",
    )
    await writeFile(targetPath, withDescription, "utf8")

    const second = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [
        file(),
        file({ path: "src/bar.ts", changeKind: "added", linesAdded: 2, linesRemoved: 0 }),
      ],
    })

    const fooRow = second.rows.find((r) => r.path === "src/foo.ts")
    const barRow = second.rows.find((r) => r.path === "src/bar.ts")
    expect(fooRow?.description).toBe("Fixed the foo bug.")
    expect(barRow?.description).toBeUndefined()

    const content = await readFile(targetPath, "utf8")
    expect(content).toContain("Fixed the foo bug.")
    expect(content).toContain("- **src/bar.ts** (added, +2/-0): _(needs description)_")
  })

  it("carries a description over to the new path when a rename is detected", async () => {
    const created = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })
    const targetPath = path.join(root, created.changesetPath ?? "")
    const withDescription = (await readFile(targetPath, "utf8")).replace(
      "_(needs description)_",
      "Fixed the foo bug.",
    )
    await writeFile(targetPath, withDescription, "utf8")

    const renamed = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [
        file({
          path: "src/renamed-foo.ts",
          changeKind: "renamed",
          renamedFrom: "src/foo.ts",
          linesAdded: 0,
          linesRemoved: 0,
        }),
      ],
    })

    expect(renamed.rows).toHaveLength(1)
    expect(renamed.rows[0]?.path).toBe("src/renamed-foo.ts")
    expect(renamed.rows[0]?.description).toBe("Fixed the foo bug.")
    const content = await readFile(targetPath, "utf8")
    expect(content).toContain(
      "- **src/renamed-foo.ts** (renamed from `src/foo.ts`, +0/-0): Fixed the foo bug.",
    )
    expect(content).not.toContain("src/foo.ts** (modified")
  })

  it("recovers a row's description when the renamed-from path contains a closing paren", () => {
    const row = file({
      path: "src/new.ts",
      changeKind: "renamed",
      renamedFrom: "src/foo(old).ts",
      linesAdded: 1,
      linesRemoved: 2,
    })
    const line = renderRow(row, "A real description.")
    const recovered = parseExistingDescriptions(line)
    expect(recovered.get("src/new.ts")).toBe("A real description.")
  })

  it("preserves human-authored prose already in the file (untouched, outside the generated section)", async () => {
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": minor\n---\n\nMy own note.\n',
      "utf8",
    )

    const result = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })

    expect(result.changesetPath).toBe(path.join(".changeset", "human.md"))
    const content = await readFile(path.join(root, result.changesetPath ?? ""), "utf8")
    expect(content).toContain("My own note.")
    expect(content).toContain('"pkg": minor')
    expect(content).toContain("### Changed Files")
  })

  it("never overwrites an existing frontmatter level -- table-manager has no opinion on release level", async () => {
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": major\n---\n\nBig human-declared change.\n',
      "utf8",
    )

    const result = await applyChangesetDocs({ root, packageName: "pkg", files: [file()] })

    const content = await readFile(path.join(root, result.changesetPath ?? ""), "utf8")
    expect(content).toContain('"pkg": major')
  })

  it("results are sorted by path deterministically", async () => {
    const result = await applyChangesetDocs({
      root,
      packageName: "pkg",
      files: [file({ path: "src/z.ts" }), file({ path: "src/a.ts" }), file({ path: "src/m.ts" })],
    })

    expect(result.rows.map((r) => r.path)).toEqual(["src/a.ts", "src/m.ts", "src/z.ts"])
  })
})
