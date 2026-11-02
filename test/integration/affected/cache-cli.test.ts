import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// The real bin over a real cache directory. Needs `dist/` (the bin imports the built engine).

const bin = path.resolve(__dirname, "../../../bin/repo-contract.mjs")
let project: string
const run = (args: string[]) =>
  spawnSync("node", [bin, ...args], { cwd: project, encoding: "utf8" })

const entry = (check: string, key: string, createdAt: string): string =>
  JSON.stringify({
    formatVersion: 1,
    check,
    key,
    inputs: {},
    value: 1,
    durationMs: 1,
    createdAt,
  })

beforeAll(() => {
  project = mkdtempSync(path.join(tmpdir(), "rc-cache-cli-"))
  const dir = path.join(project, ".repo-contract", "cache", "index")
  mkdirSync(path.join(dir, "tests"), { recursive: true })
  mkdirSync(path.join(dir, "lint"), { recursive: true })
  writeFileSync(
    path.join(dir, "tests", `${"a".repeat(64)}.json`),
    entry("tests", "a".repeat(64), "2020-01-01T00:00:00.000Z"),
  )
  writeFileSync(
    path.join(dir, "lint", `${"b".repeat(64)}.json`),
    entry("lint", "b".repeat(64), new Date().toISOString()),
  )
  writeFileSync(path.join(dir, "lint", "junk.json"), "junk")
})
afterAll(() => {
  rmSync(project, { recursive: true, force: true })
})

describe("repo-contract cache", () => {
  it("is listed in the top-level help", () => {
    expect(run(["--help"]).stdout).toContain("repo-contract cache")
  })

  it("prints its own help", () => {
    expect(run(["cache", "--help"])).toMatchObject({ status: 0, stderr: "" })
    expect(run(["cache", "--help"]).stdout).toContain("Usage: repo-contract cache <command>")
  })

  it("reports a usage error as exit 2", () => {
    expect(run(["cache", "bogus"])).toMatchObject({ status: 2, stdout: "" })
    expect(run(["cache"])).toMatchObject({ status: 2, stdout: "" })
  })

  it("counts entries, then prunes the old and unreadable ones, then clears", () => {
    const stats = JSON.parse(run(["cache", "stats", "--json"]).stdout) as Record<string, unknown>
    expect(stats).toMatchObject({ schemaVersion: 1, entries: 2, corrupt: 1 })

    expect(run(["cache", "prune", "--max-age", "30d"])).toMatchObject({
      status: 0,
      stdout: "Removed 2 entries\n",
    })
    expect(
      readdirSync(path.join(project, ".repo-contract", "cache", "index", "lint")),
    ).toHaveLength(1)

    expect(run(["cache", "clear"])).toMatchObject({ status: 0, stdout: "Removed 1 entry\n" })
    expect(run(["cache", "stats"])).toMatchObject({ status: 0, stdout: "0 entries (0 B)\n" })
  })

  it("works when the cache directory does not exist", () => {
    expect(run(["cache", "stats", "--cache-dir", "nowhere"])).toMatchObject({
      status: 0,
      stdout: "0 entries (0 B)\n",
    })
  })
})
