import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  EXCLUDED_DIRECTORY_LEAF_NAMES,
  EXCLUDED_DIRECTORY_NAMES,
  INCLUDED_EXTENSIONS,
  listSourceFiles,
  toPosixPath,
} from "../../../scripts/suppression-governance/find-source-files.js"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-find-source-files-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(relativePath: string, content = ""): Promise<void> {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, "utf8")
}

describe("toPosixPath", () => {
  it("converts Windows-style backslash separators to POSIX forward slashes", () => {
    expect(toPosixPath("src\\foo\\bar.ts")).toBe("src/foo/bar.ts")
  })

  it("is a no-op for an already-POSIX path", () => {
    expect(toPosixPath("src/foo/bar.ts")).toBe("src/foo/bar.ts")
  })
})

describe("listSourceFiles", () => {
  it("finds governed source files and returns repo-relative POSIX paths, sorted", async () => {
    await write("b.ts")
    await write("src/a.ts")

    expect(await listSourceFiles(root)).toEqual(["b.ts", "src/a.ts"])
  })

  it("only includes files with a governed extension", async () => {
    await write("a.ts")
    await write("a.json")
    await write("a.md")
    await write("a.png")

    expect(await listSourceFiles(root)).toEqual(["a.ts"])
  })

  it("matches a governed extension case-insensitively, e.g. an uppercase .TS", async () => {
    await write("A.TS")
    await write("B.Ts")

    expect(await listSourceFiles(root)).toEqual(["A.TS", "B.Ts"])
  })

  it("includes every extension in INCLUDED_EXTENSIONS", async () => {
    for (const [index, extension] of INCLUDED_EXTENSIONS.entries()) {
      await write(`dir${String(index)}/a${extension}`)
    }

    const found = await listSourceFiles(root)
    expect(found).toHaveLength(INCLUDED_EXTENSIONS.length)
  })

  it("never walks any directory named in EXCLUDED_DIRECTORY_NAMES, at the repository root", async () => {
    for (const name of EXCLUDED_DIRECTORY_NAMES) {
      await write(`${name}/index.ts`)
    }
    await write("src/real.ts")

    expect(await listSourceFiles(root)).toEqual(["src/real.ts"])
  })

  it("never walks any directory named in EXCLUDED_DIRECTORY_LEAF_NAMES, at any depth", async () => {
    for (const name of EXCLUDED_DIRECTORY_LEAF_NAMES) {
      await write(`test/e2e/consumer-install/${name}/pkg/index.ts`)
      await write(`test/unit/architecture/${name}/violating/index.ts`)
    }
    await write("test/unit/real.test.ts")

    expect(await listSourceFiles(root)).toEqual(["test/unit/real.test.ts"])
  })

  it("excludes a differently-cased excluded directory name, e.g. Node_Modules or Dist", async () => {
    await write("Node_Modules/pkg/index.ts")
    await write("Dist/index.ts")
    await write("FIXTURES/violating/index.ts")
    await write("src/real.ts")

    expect(await listSourceFiles(root)).toEqual(["src/real.ts"])
  })

  it("never follows a symlinked directory, even one pointing outside the walked root", async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), "repo-contract-find-source-files-outside-"),
    )
    await writeFile(path.join(outside, "secret.ts"), "", "utf8")

    await write("src/real.ts")
    await symlink(outside, path.join(root, "src", "escape"), "dir")

    try {
      expect(await listSourceFiles(root)).toEqual(["src/real.ts"])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("never follows a symlinked file", async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), "repo-contract-find-source-files-outside-"),
    )
    const outsideFile = path.join(outside, "secret.ts")
    await writeFile(outsideFile, "", "utf8")

    await write("src/real.ts")
    await symlink(outsideFile, path.join(root, "src", "linked.ts"), "file")

    try {
      expect(await listSourceFiles(root)).toEqual(["src/real.ts"])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
