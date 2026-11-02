import { describe, expect, it } from "vitest"
import {
  MERGE_MUTATION_USAGE,
  parseMergeMutationArgs,
  runMergeMutation,
} from "../../../bin/merge-mutation-cli.mjs"
import { mergeMutationReports } from "../../../src/affected/index.js"

const report = (files: Record<string, unknown>) =>
  JSON.stringify({ schemaVersion: "2", thresholds: {}, files })

async function invoke(argv: string[], files: Record<string, string> = {}, failWrite = false) {
  const out: string[] = []
  const err: string[] = []
  const written: Record<string, string> = {}
  const code = await runMergeMutation({
    argv,
    cwd: "/work/project",
    version: "9.9.9",
    stdout: (t: string) => out.push(t),
    stderr: (t: string) => err.push(t),
    engine: { mergeMutationReports },
    readFile: async (file: string) => files[file],
    writeFile: async (file: string, text: string) => {
      if (failWrite) throw new Error("disk full")
      written[file] = text
    },
  })
  return { code, stdout: out.join(""), stderr: err.join(""), written }
}

describe("parseMergeMutationArgs", () => {
  it("reads --total, --out and the numbered report files", () => {
    expect(
      parseMergeMutationArgs(["--total", "2", "--out", "m.json", "1=a.json", "2=b.json"]),
    ).toEqual({
      kind: "run",
      options: {
        total: 2,
        out: "m.json",
        reports: [
          { shard: 1, file: "a.json" },
          { shard: 2, file: "b.json" },
        ],
      },
    })
    expect(parseMergeMutationArgs(["--total=1", "1=dir/a=b.json"])).toEqual({
      kind: "run",
      options: { total: 1, reports: [{ shard: 1, file: "dir/a=b.json" }] },
    })
  })

  it.each([
    [["--help"], { kind: "help" }],
    [["-V"], { kind: "version" }],
    [["--bogus"], { kind: "error", message: "unknown option '--bogus'" }],
    [["1=a.json"], { kind: "error", message: "--total <n> is required" }],
    [
      ["--total", "0", "1=a.json"],
      { kind: "error", message: "option '--total' needs a positive whole number, not '0'" },
    ],
    [
      ["--total", "x"],
      { kind: "error", message: "option '--total' needs a positive whole number, not 'x'" },
    ],
    [["--total"], { kind: "error", message: "option '--total' needs a value" }],
    [["--total", "1"], { kind: "error", message: "give each shard's report as <shard>=<file>" }],
    [["--total", "1", "a.json"], { kind: "error", message: "'a.json' is not <shard>=<file>" }],
    [["--total", "1", "0=a.json"], { kind: "error", message: "'0=a.json' is not <shard>=<file>" }],
    [["--total", "1", "1="], { kind: "error", message: "'1=' is not <shard>=<file>" }],
    [["--total", "1", "--out"], { kind: "error", message: "option '--out' needs a value" }],
  ])("reads %j", (argv, expected) => {
    expect(parseMergeMutationArgs(argv)).toEqual(expected)
  })

  it("documents its options", () => {
    for (const text of ["--total", "--out", "<shard>=<file>", "--help"])
      expect(MERGE_MUTATION_USAGE).toContain(text)
  })
})

describe("runMergeMutation", () => {
  const files = {
    "/work/project/a.json": report({ "src/a.ts": { mutants: [] } }),
    "/work/project/b.json": report({ "src/b.ts": { mutants: [] } }),
  }

  it("prints help, the version, and usage errors with exit 2", async () => {
    expect((await invoke(["-h"])).stdout).toContain("Usage: repo-contract merge-mutation")
    expect((await invoke(["-V"])).stdout).toBe("9.9.9\n")
    const bad = await invoke(["--bogus"])
    expect(bad.code).toBe(2)
    expect(bad.stderr).toContain("repo-contract merge-mutation: unknown option '--bogus'")
  })

  it("merges the shards to stdout", async () => {
    const { code, stdout } = await invoke(["--total", "2", "1=a.json", "2=b.json"], files)
    expect(code).toBe(0)
    expect(Object.keys((JSON.parse(stdout) as { files: object }).files)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ])
  })

  it("writes to --out instead, relative to the working directory, and says so on stderr", async () => {
    const { code, stdout, stderr, written } = await invoke(
      ["--total", "2", "--out", "out/m.json", "1=a.json", "2=b.json"],
      files,
    )
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(Object.keys(written)).toEqual(["/work/project/out/m.json"])
    expect(stderr).toContain("merged 2 shards into out/m.json")
  })

  it("fails with exit 1 when a shard is missing, naming it", async () => {
    const { code, stderr, written } = await invoke(
      ["--total", "3", "--out", "m.json", "1=a.json", "2=b.json"],
      files,
    )
    expect(code).toBe(1)
    expect(stderr).toContain("Expected 3 shard reports but got 2; missing shard 3.")
    expect(written).toEqual({})
  })

  it("fails with exit 1 when two shards mutated the same file", async () => {
    const { code, stderr } = await invoke(["--total", "2", "1=a.json", "2=a.json"], files)
    expect(code).toBe(1)
    expect(stderr).toContain("src/a.ts appears in shards 1 and 2.")
  })

  it("fails with exit 1 when a report cannot be read or is not JSON", async () => {
    const missing = await invoke(["--total", "1", "1=nope.json"], files)
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain("could not read nope.json")
    const bad = await invoke(["--total", "1", "1=bad.json"], { "/work/project/bad.json": "{" })
    expect(bad.code).toBe(1)
    expect(bad.stderr).toContain("bad.json is not valid JSON")
  })

  it("fails with exit 1 when the output cannot be written", async () => {
    const { code, stderr } = await invoke(
      ["--total", "2", "--out", "m.json", "1=a.json", "2=b.json"],
      files,
      true,
    )
    expect(code).toBe(1)
    expect(stderr).toContain("repo-contract merge-mutation: failed: disk full")
  })

  it("uses -C as the base for every path", async () => {
    const { written } = await invoke(["-C", "pkg", "--total", "1", "--out", "m.json", "1=a.json"], {
      "/work/project/pkg/a.json": report({}),
    })
    expect(Object.keys(written)).toEqual(["/work/project/pkg/m.json"])
  })
})
