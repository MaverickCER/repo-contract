import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  readBaseline,
  readPackageJson,
  readSchemaVersion,
  sha256,
  writeBaselineFiles,
} from "../../../scripts/api-contract/baseline-store.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"

/**
 * Real, disposable git repositories in os.tmpdir() -- never mocked -- per CONTRIBUTING.md's
 * real-behavior-over-mocking house style. `readBaseline` is git-`HEAD`-based, so these tests are
 * the only reliable way to exercise that behavior at all.
 */

let repoDir: string

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" })
}

async function writeAndCommitBaseline(): Promise<{ apiJsonText: string; dtsText: string }> {
  const apiJsonText = JSON.stringify({ name: "example" })
  const dtsText = "export declare function example(): void;\n"
  await writeBaselineFiles(repoDir, {
    apiJsonText,
    dtsText,
    packageName: "example",
    packageVersion: "1.0.0",
    apiExtractorVersion: "7.0.0",
    apiJsonSchemaVersion: 1011,
  })
  git("add", ".")
  git("commit", "-m", "add baseline")
  return { apiJsonText, dtsText }
}

beforeEach(async () => {
  repoDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-baseline-store-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  // Isolate from a contributor's global config: signed commits would prompt/fail
  // in a scratch repo, and an inherited hooksPath could run unrelated hooks.
  git("config", "commit.gpgsign", "false")
  git("config", "core.hooksPath", "")
})

afterEach(async () => {
  await removeTempDir(repoDir)
})

describe("readBaseline", () => {
  it("returns undefined when the repository has zero commits yet (unborn HEAD) -- not an error", async () => {
    await expect(readBaseline(repoDir)).resolves.toBeUndefined()
  })

  it("returns undefined when there are commits but no baseline was ever committed", async () => {
    await writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8")
    git("add", ".")
    git("commit", "-m", "initial")
    await expect(readBaseline(repoDir)).resolves.toBeUndefined()
  })

  it("throws when root is not inside a git working tree at all", async () => {
    const nonGitDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-not-a-repo-"))
    try {
      await expect(readBaseline(nonGitDir)).rejects.toThrow(/git working tree/)
    } finally {
      await removeTempDir(nonGitDir)
    }
  })

  it("reads a committed baseline back with matching content and metadata", async () => {
    const { apiJsonText, dtsText } = await writeAndCommitBaseline()
    const baseline = await readBaseline(repoDir)
    expect(baseline?.apiJsonText).toBe(apiJsonText)
    expect(baseline?.dtsText).toBe(dtsText)
    expect(baseline?.meta.packageName).toBe("example")
    expect(baseline?.meta.packageVersion).toBe("1.0.0")
  })

  it("ignores an uncommitted working-tree modification to baseline.api.json -- the committed HEAD version is authoritative", async () => {
    const { apiJsonText } = await writeAndCommitBaseline()
    await writeFile(
      path.join(repoDir, ".repo-contract/api-contract/baseline.api.json"),
      JSON.stringify({ name: "tampered" }),
      "utf8",
    )
    const baseline = await readBaseline(repoDir)
    expect(baseline?.apiJsonText).toBe(apiJsonText)
    expect(baseline?.apiJsonText).not.toContain("tampered")
  })

  it("throws when baseline.d.ts's content does not match the hash recorded in baseline.meta.json", async () => {
    await writeAndCommitBaseline()
    const metaPath = path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json")
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { dtsHash: string }
    meta.dtsHash = "0".repeat(64)
    await writeFile(metaPath, JSON.stringify(meta), "utf8")
    git("add", ".")
    git("commit", "-m", "corrupt hash")

    await expect(readBaseline(repoDir)).rejects.toThrow(/does not match the hash/)
  })

  it("throws when baseline.api.json's content does not match the hash recorded in baseline.meta.json", async () => {
    await writeAndCommitBaseline()
    const metaPath = path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json")
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { apiJsonHash: string }
    meta.apiJsonHash = "0".repeat(64)
    await writeFile(metaPath, JSON.stringify(meta), "utf8")
    git("add", ".")
    git("commit", "-m", "corrupt hash")

    await expect(readBaseline(repoDir)).rejects.toThrow(/does not match the hash/)
  })

  it("throws a clear error instead of crashing deep in a consumer when packageVersion is missing from baseline.meta.json", async () => {
    await writeAndCommitBaseline()
    const metaPath = path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json")
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>
    delete meta.packageVersion
    await writeFile(metaPath, JSON.stringify(meta), "utf8")
    git("add", ".")
    git("commit", "-m", "corrupt meta: drop packageVersion")

    await expect(readBaseline(repoDir)).rejects.toThrow(/"packageVersion" must be a string/)
  })

  it("throws a clear error when apiJsonSchemaVersion is the wrong type in baseline.meta.json", async () => {
    await writeAndCommitBaseline()
    const metaPath = path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json")
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>
    meta.apiJsonSchemaVersion = "1011"
    await writeFile(metaPath, JSON.stringify(meta), "utf8")
    git("add", ".")
    git("commit", "-m", "corrupt meta: stringify apiJsonSchemaVersion")

    await expect(readBaseline(repoDir)).rejects.toThrow(/"apiJsonSchemaVersion" must be a number/)
  })

  it("throws a clear error when baseline.meta.json is not a JSON object at all", async () => {
    await writeAndCommitBaseline()
    const metaPath = path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json")
    await writeFile(metaPath, JSON.stringify("not an object"), "utf8")
    git("add", ".")
    git("commit", "-m", "corrupt meta: string instead of object")

    await expect(readBaseline(repoDir)).rejects.toThrow(/not a JSON object/)
  })
})

describe("writeBaselineFiles", () => {
  it("writes all three files with hashes that verify against their own content", async () => {
    await mkdir(repoDir, { recursive: true })
    await writeBaselineFiles(repoDir, {
      apiJsonText: '{"name":"pkg"}',
      dtsText: "export {};\n",
      packageName: "pkg",
      packageVersion: "0.1.0",
      apiExtractorVersion: "7.0.0",
      apiJsonSchemaVersion: 1011,
    })

    const meta = JSON.parse(
      await readFile(path.join(repoDir, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ) as { apiJsonHash: string; dtsHash: string; packageVersion: string }

    expect(meta.apiJsonHash).toBe(sha256('{"name":"pkg"}'))
    expect(meta.dtsHash).toBe(sha256("export {};\n"))
    expect(meta.packageVersion).toBe("0.1.0")
  })

  it("readSchemaVersion throws an actionable error, not a raw SyntaxError, on a truncated API Extractor report", () => {
    expect(() => readSchemaVersion('{"metadata": {"schemaVe')).toThrow(/not valid JSON/)
    expect(readSchemaVersion(JSON.stringify({ metadata: { schemaVersion: 1011 } }))).toBe(1011)
  })

  it("readPackageJson throws an actionable error, not a raw SyntaxError, on a malformed package.json", async () => {
    await mkdir(repoDir, { recursive: true })
    await writeFile(path.join(repoDir, "package.json"), "{ not json", "utf8")
    await expect(readPackageJson(repoDir)).rejects.toThrow(/not valid JSON/)
  })

  it("leaves no temp files behind -- each file is written via a same-directory temp file plus atomic rename, not in place", async () => {
    await mkdir(repoDir, { recursive: true })
    await writeBaselineFiles(repoDir, {
      apiJsonText: '{"name":"pkg"}',
      dtsText: "export {};\n",
      packageName: "pkg",
      packageVersion: "0.1.0",
      apiExtractorVersion: "7.0.0",
      apiJsonSchemaVersion: 1011,
    })

    const entries = await readdir(path.join(repoDir, ".repo-contract/api-contract"))
    expect(entries.sort()).toEqual(["baseline.api.json", "baseline.d.ts", "baseline.meta.json"])
  })
})
