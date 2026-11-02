import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { AFFECTED_USAGE, parseAffectedArgs, runAffected } from "../../../bin/affected-cli.mjs"
import {
  computeAffectedFromGit,
  explainAffected,
  parseAffectedConfig,
  parseShardSpec,
  planShards,
  shardMatrix,
} from "../../../src/affected/index.js"
import { fakeGit } from "../affected/fake-git.js"
import type { FakeRepo } from "../affected/fake-git.js"

interface Report {
  scope: string
  fullBecause?: { reason: string; file: string }
  changedFiles: string[]
  affectedTests: string[]
  explanations: string[]
}

const base = {
  "src/a.ts": "export const a = 1\n",
  "src/b.ts": 'import { a } from "./a.js"\nexport const b = a\n',
  "test/b.test.ts": 'import { b } from "../src/b.js"\nb\n',
  "test/other.test.ts": "export {}\n",
}
const edited = { ...base, "src/a.ts": "export const a = 2\n" }

interface Harness {
  readonly out: string[]
  readonly err: string[]
  readonly dirs: string[]
}

async function invoke(
  argv: string[],
  repo: Partial<FakeRepo> = { work: edited },
  overrides: Record<string, unknown> = {},
): Promise<{ code: number; stdout: string; stderr: string; harness: Harness }> {
  const harness: Harness = { out: [], err: [], dirs: [] }
  const code = await runAffected({
    argv,
    cwd: "/work/project",
    version: "9.9.9",
    stdout: (text: string) => harness.out.push(text),
    stderr: (text: string) => harness.err.push(text),
    engine: {
      computeAffectedFromGit,
      explainAffected,
      parseAffectedConfig,
      parseShardSpec,
      planShards,
      shardMatrix,
    },
    createCapabilities: (dir: string) => {
      harness.dirs.push(dir)
      return fakeGit({ base, work: edited, ...repo }).capabilities
    },
    loadTypeScript: async () => ts,
    ...overrides,
  })
  return { code, stdout: harness.out.join(""), stderr: harness.err.join(""), harness }
}

describe("parseAffectedArgs", () => {
  it("defaults to a text report against the default base", () => {
    expect(parseAffectedArgs([])).toEqual({
      kind: "run",
      options: { format: "text", explain: false },
    })
  })

  it.each([
    [["--base", "main"], "main"],
    [["--base=main"], "main"],
    [["--base=origin/release/1.x"], "origin/release/1.x"],
  ])("reads the base from %j", (argv, expected) => {
    expect(parseAffectedArgs(argv)).toMatchObject({ kind: "run", options: { base: expected } })
  })

  it.each([
    [["-C", "pkg"], "pkg"],
    [["-C=pkg"], undefined],
  ])("reads the directory from %j", (argv, expected) => {
    const parsed = parseAffectedArgs(argv)
    if (expected === undefined) {
      expect(parsed.kind).toBe("error")
    } else {
      expect(parsed).toMatchObject({ kind: "run", options: { cwd: expected } })
    }
  })

  it.each([
    [["--json"], "json"],
    [["--tests"], "tests"],
    [["--sources"], "sources"],
    [["--mutate"], "mutate"],
  ])("selects the %j format", (argv, format) => {
    expect(parseAffectedArgs(argv)).toMatchObject({ kind: "run", options: { format } })
  })

  it("reads the tsconfig to use", () => {
    expect(parseAffectedArgs(["--tsconfig", "cfg/tsconfig.app.json"])).toMatchObject({
      kind: "run",
      options: { tsconfig: "cfg/tsconfig.app.json" },
    })
    expect(parseAffectedArgs(["--tsconfig=a.json"])).toMatchObject({
      options: { tsconfig: "a.json" },
    })
    expect(parseAffectedArgs(["--tsconfig"])).toEqual({
      kind: "error",
      message: "option '--tsconfig' needs a value",
    })
  })

  it("accepts --explain with the text and json formats", () => {
    expect(parseAffectedArgs(["--explain"])).toMatchObject({ options: { explain: true } })
    expect(parseAffectedArgs(["--json", "--explain"])).toMatchObject({
      options: { format: "json", explain: true },
    })
  })

  it("accepts options in any order", () => {
    expect(parseAffectedArgs(["--json", "--base", "x", "-C", "d"])).toEqual({
      kind: "run",
      options: { format: "json", explain: false, base: "x", cwd: "d" },
    })
  })

  it.each([
    [["--help"], "help"],
    [["-h"], "help"],
    [["--version"], "version"],
    [["-V"], "version"],
  ])("recognises %j", (argv, kind) => {
    expect(parseAffectedArgs(argv)).toEqual({ kind })
  })

  it("lets --help win over any other mistake", () => {
    expect(parseAffectedArgs(["--bogus", "--help"])).toEqual({ kind: "help" })
  })

  it.each([
    [["--bogus"], "unknown option '--bogus'"],
    [["-x"], "unknown option '-x'"],
    [["extra"], "unexpected argument 'extra'"],
    [["--base"], "option '--base' needs a value"],
    [["-C"], "option '-C' needs a value"],
    [["--base", "--json"], "option '--base' needs a value"],
    [["--base="], "option '--base' needs a value"],
    [["--json", "--tests"], "--json cannot be combined with --tests"],
    [["--tests", "--sources"], "--tests cannot be combined with --sources"],
    [["--tests", "--explain"], "--explain cannot be combined with --tests"],
    [["--json=1"], "option '--json' does not take a value"],
    [["--", "x"], "unexpected argument 'x'"],
  ])("rejects %j with a message naming the problem", (argv, message) => {
    expect(parseAffectedArgs(argv)).toEqual({ kind: "error", message })
  })
})

describe("runAffected: usage and version", () => {
  it("prints help to stdout and exits 0 without touching git", async () => {
    let touched = false
    const { code, stdout, stderr } = await invoke(
      ["--help"],
      {},
      {
        createCapabilities: () => {
          touched = true
        },
      },
    )
    expect(code).toBe(0)
    expect(stdout).toBe(`${AFFECTED_USAGE}\n`)
    expect(stderr).toBe("")
    expect(touched).toBe(false)
  })

  it("documents every option and the exit statuses", () => {
    for (const text of [
      "--base",
      "-C",
      "--json",
      "--explain",
      "--tests",
      "--sources",
      "--mutate",
      "--help",
      "--version",
      "Exit status",
    ]) {
      expect(AFFECTED_USAGE).toContain(text)
    }
  })

  it("prints the version", async () => {
    const { code, stdout, stderr } = await invoke(["--version"])
    expect([code, stdout, stderr]).toEqual([0, "9.9.9\n", ""])
  })

  it("reports a usage error on stderr, exits 2, and prints nothing on stdout", async () => {
    const { code, stdout, stderr } = await invoke(["--bogus"])
    expect(code).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toBe(
      "repo-contract affected: unknown option '--bogus'\nTry 'repo-contract affected --help' for more information.\n",
    )
  })
})

describe("runAffected: reports", () => {
  it("prints a readable text report, with nothing on stderr", async () => {
    const { code, stdout, stderr } = await invoke([])
    expect(code).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toBe(
      [
        "scope: affected",
        "",
        "changed files (1):",
        "  src/a.ts",
        "",
        "changed symbols (2):",
        "  src/a.ts#a",
        "  src/b.ts#b",
        "",
        "affected tests (1):",
        "  test/b.test.ts",
        "",
        "mutation targets (2):",
        "  src/a.ts",
        "  src/b.ts",
        "",
      ].join("\n"),
    )
  })

  it("says so plainly when nothing is affected", async () => {
    const { code, stdout } = await invoke([], { work: base })
    expect(code).toBe(0)
    expect(stdout).toBe("scope: affected\n\nnothing is affected\n")
  })

  it("explains each test when asked", async () => {
    const { stdout } = await invoke(["--explain"])
    expect(stdout).toContain("why:\n  test/b.test.ts must run <- ")
    expect(stdout.trimEnd().endsWith("src/a.ts changed")).toBe(true)
  })

  it("emits a stable machine-readable report with --json", async () => {
    const { code, stdout, stderr } = await invoke(["--json"])
    expect(code).toBe(0)
    expect(stderr).toBe("")
    expect(stdout.endsWith("\n")).toBe(true)
    expect(JSON.parse(stdout)).toEqual({
      schemaVersion: 1,
      scope: "affected",
      changedFiles: ["src/a.ts"],
      changedSymbols: ["src/a.ts#a", "src/b.ts#b"],
      affectedSources: ["src/a.ts", "src/b.ts"],
      affectedTests: ["test/b.test.ts"],
      mutateTargets: ["src/a.ts", "src/b.ts"],
      widened: [],
    })
  })

  it("adds explanations to the json report only when asked", async () => {
    const { stdout } = await invoke(["--json", "--explain"])
    const report = JSON.parse(stdout) as Report
    expect(report.explanations).toHaveLength(1)
    expect(report.explanations[0]).toMatch(/^test\/b\.test\.ts must run <- /)
    expect(JSON.parse((await invoke(["--json"])).stdout) as Report).not.toHaveProperty(
      "explanations",
    )
  })

  it.each([
    [["--tests"], "test/b.test.ts\n"],
    [["--sources"], "src/a.ts\nsrc/b.ts\n"],
    [["--mutate"], "src/a.ts\nsrc/b.ts\n"],
  ])("prints only the paths for %j, one per line", async (argv, expected) => {
    const { code, stdout, stderr } = await invoke(argv)
    expect([code, stdout, stderr]).toEqual([0, expected, ""])
  })

  it("prints nothing at all for an empty path list", async () => {
    const { code, stdout } = await invoke(["--tests"], { work: base })
    expect([code, stdout]).toEqual([0, ""])
  })
})

describe("runAffected: a full result is still success, with the reason on stderr", () => {
  const full = {
    work: { ...edited, "package.json": "{}" },
    base: { ...base, "package.json": "{ }" },
  }

  it("exits 0 and lists everything on stdout", async () => {
    const { code, stdout } = await invoke(["--tests"], full)
    expect(code).toBe(0)
    expect(stdout).toBe("test/b.test.ts\ntest/other.test.ts\n")
  })

  it("explains on stderr in every format", async () => {
    for (const argv of [[], ["--json"], ["--tests"]]) {
      const { stderr } = await invoke(argv, full)
      expect(stderr).toBe(
        "repo-contract affected: running everything (global-trigger: package.json)\n",
      )
    }
  })

  it("shows the reason in the text report and in json", async () => {
    expect((await invoke([], full)).stdout.split("\n")[0]).toBe(
      "scope: full (global-trigger: package.json)",
    )
    expect(JSON.parse((await invoke(["--json"], full)).stdout)).toMatchObject({
      scope: "full",
      fullBecause: { reason: "global-trigger", file: "package.json", to: "full" },
    })
  })

  it("includes the detail in the stderr notice when there is one", async () => {
    const { stderr } = await invoke([], { work: base, refs: [] })
    expect(stderr).toBe(
      "repo-contract affected: running everything (git-failed: merge-base -- no base to compare against)\n",
    )
  })
})

describe("runAffected: options reach the engine", () => {
  it("passes --base through", async () => {
    const { stdout } = await invoke(["--base", "nope", "--json"], { refs: ["origin/main"] })
    expect((JSON.parse(stdout) as Report).fullBecause).toMatchObject({ file: "nope" })
  })

  it("resolves -C against the working directory", async () => {
    const relative = await invoke(["-C", "pkg/app"])
    expect(relative.harness.dirs).toEqual([path.resolve("/work/project", "pkg/app")])
    const absolute = await invoke(["-C", "/elsewhere"])
    expect(absolute.harness.dirs).toEqual(["/elsewhere"])
    const none = await invoke([])
    expect(none.harness.dirs).toEqual(["/work/project"])
  })

  it("loads TypeScript from the directory it runs in", async () => {
    const seen: string[] = []
    await invoke(
      ["-C", "pkg"],
      {},
      {
        loadTypeScript: async (dir: string) => {
          seen.push(dir)
          return ts
        },
      },
    )
    expect(seen).toEqual([path.resolve("/work/project", "pkg")])
  })
})

describe("runAffected: configuration in package.json", () => {
  const withConfig = (block: unknown, extra: Record<string, string> = {}) => {
    const manifest = JSON.stringify({ name: "x", "repo-contract": { affected: block } })
    return {
      base: { ...base, "package.json": manifest },
      work: { ...edited, "package.json": manifest, ...extra },
    }
  }

  it("applies ignore, triggers, tests and links", async () => {
    const repo = withConfig(
      { ignore: ["notes/**"], links: [{ when: "fixtures/**", run: ["test/other.test.ts"] }] },
      { "notes/a.txt": "x", "fixtures/g.txt": "x" },
    )
    const { stdout } = await invoke(["--json"], { ...repo, base: { ...repo.base } })
    const report = JSON.parse(stdout) as { scope: string; affectedTests: string[] }
    expect(report.scope).toBe("affected")
    expect(report.affectedTests).toEqual(["test/b.test.ts", "test/other.test.ts"])
  })

  it("exits 1, naming the problem, when the block is invalid", async () => {
    const { code, stdout, stderr } = await invoke([], withConfig({ ignroe: [] }))
    expect(code).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toBe(
      "repo-contract affected: invalid configuration in package.json (repo-contract.affected): unknown key 'ignroe' (expected one of: ignore, triggers, tests, notMutated, links)\n",
    )
  })

  it("exits 1 when package.json is not valid JSON", async () => {
    const { code, stderr } = await invoke([], {
      base: { ...base, "package.json": "{" },
      work: { ...edited, "package.json": "{" },
    })
    expect(code).toBe(1)
    expect(stderr).toBe("repo-contract affected: package.json is not valid JSON\n")
  })

  it("works without a package.json, or without the block", async () => {
    expect((await invoke(["--tests"])).stdout).toBe("test/b.test.ts\n")
    const manifest = JSON.stringify({ name: "x" })
    const repo = {
      base: { ...base, "package.json": manifest },
      work: { ...edited, "package.json": manifest },
    }
    expect((await invoke(["--tests"], repo)).stdout).toBe("test/b.test.ts\n")
  })

  it("passes --tsconfig to the engine", async () => {
    const seen: unknown[] = []
    await invoke(
      ["--tsconfig", "cfg/t.json"],
      {},
      {
        engine: {
          computeAffectedFromGit: async (input: Record<string, unknown>) => {
            seen.push(input.tsconfig)
            return computeAffectedFromGit(input as never)
          },
          explainAffected,
          parseAffectedConfig,
        },
      },
    )
    expect(seen).toEqual(["cfg/t.json"])
  })
})

describe("runAffected: failures exit 1 with one clear line on stderr", () => {
  it("reports a TypeScript that cannot be loaded", async () => {
    const { code, stdout, stderr } = await invoke(
      [],
      {},
      {
        loadTypeScript: async () => {
          throw new Error("Cannot find module 'typescript'")
        },
      },
    )
    expect(code).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toBe(
      "repo-contract affected: could not load TypeScript from /work/project: Cannot find module 'typescript'\n" +
        "Install it with: npm install --save-dev typescript\n",
    )
  })

  it("reports a TypeScript without the compiler API", async () => {
    const { code, stderr } = await invoke(
      [],
      {},
      { loadTypeScript: async () => ({ version: "7.0.0" }) },
    )
    expect(code).toBe(1)
    expect(stderr).toBe(
      "repo-contract affected: the installed TypeScript has no compiler API (TypeScript 7 does not); install typescript@6 or earlier\n",
    )
  })

  it("reports an unexpected error without a stack trace", async () => {
    const { code, stdout, stderr } = await invoke(
      [],
      {},
      {
        createCapabilities: () => {
          throw new Error("spawn git ENOENT")
        },
      },
    )
    expect(code).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toBe("repo-contract affected: failed: spawn git ENOENT\n")
  })

  it("reports a non-Error throw", async () => {
    const { stderr } = await invoke(
      [],
      {},
      {
        createCapabilities: () => {
          const thrown: unknown = "boom"
          throw thrown
        },
      },
    )
    expect(stderr).toBe("repo-contract affected: failed: boom\n")
  })
})

describe("parseAffectedArgs sharding options", () => {
  it("reads --shard, --timings and the plan options", () => {
    expect(parseAffectedArgs(["--mutate", "--shard", "2/3", "--timings=t.json"])).toMatchObject({
      kind: "run",
      options: { format: "mutate", shard: { index: 2, total: 3 }, timings: "t.json" },
    })
    expect(
      parseAffectedArgs(["--plan-shards", "--target-minutes", "10", "--max-shards", "4"]),
    ).toMatchObject({
      kind: "run",
      options: { format: "plan", targetMinutes: 10, maxShards: 4 },
    })
    expect(parseAffectedArgs(["--plan-shards", "--shards=3"])).toMatchObject({
      options: { format: "plan", shards: 3 },
    })
  })

  it.each([
    [["--shard", "4/3"], "A shard must be written <index>/<total>"],
    [["--tests", "--shard", "1/2"], "--shard only applies to the mutation targets"],
    [["--sources", "--shard", "1/2"], "--shard only applies to the mutation targets"],
    [["--plan-shards"], "--plan-shards needs --shards <n> or --target-minutes <n>"],
    [
      ["--plan-shards", "--shards", "0"],
      "option '--shards' needs a positive whole number, not '0'",
    ],
    [
      ["--plan-shards", "--shards", "x"],
      "option '--shards' needs a positive whole number, not 'x'",
    ],
    [
      ["--plan-shards", "--target-minutes", "0"],
      "option '--target-minutes' needs a positive number, not '0'",
    ],
    [["--plan-shards", "--target-minutes", "-1"], "option '--target-minutes' needs a value"],
    [
      ["--plan-shards", "--target-minutes", "5", "--max-shards", "1.5"],
      "option '--max-shards' needs a positive whole number, not '1.5'",
    ],
    [["--shards", "2"], "--shards only applies with --plan-shards"],
    [["--target-minutes", "2"], "--target-minutes only applies with --plan-shards"],
    [["--max-shards", "2"], "--max-shards only applies with --plan-shards"],
    [["--timings", "t.json"], "--timings only applies with --shard or --plan-shards"],
    [["--plan-shards", "--shards", "2", "--json"], "--plan-shards cannot be combined with --json"],
    [
      ["--plan-shards", "--shards", "2", "--mutate"],
      "--plan-shards cannot be combined with --mutate",
    ],
    [
      ["--plan-shards", "--shards", "2", "--explain"],
      "--explain cannot be combined with --plan-shards",
    ],
    [
      ["--plan-shards", "--shards", "2", "--shard", "1/2"],
      "--shard cannot be combined with --plan-shards",
    ],
  ])("rejects %j", (argv, message) => {
    const parsed = parseAffectedArgs(argv)
    expect(parsed.kind).toBe("error")
    expect((parsed as { message: string }).message).toContain(message)
  })

  it("documents the options in the usage text", () => {
    for (const name of [
      "--shard",
      "--plan-shards",
      "--shards",
      "--target-minutes",
      "--max-shards",
      "--timings",
    ]) {
      expect(AFFECTED_USAGE).toContain(name)
    }
  })
})

describe("runAffected sharding", () => {
  const wide = {
    ...edited,
    "src/b.ts": 'import { a } from "./a.js"\nexport const b = a + 1\n',
  }
  const targets = async () => {
    const { stdout } = await invoke(["--mutate"], { work: wide })
    return stdout.split("\n").filter(Boolean)
  }

  it("prints only one shard's mutation targets, and the shards together are all of them", async () => {
    const all = await targets()
    expect(all.length).toBeGreaterThan(1)
    const first = await invoke(["--mutate", "--shard", "1/2"], { work: wide })
    const second = await invoke(["--mutate", "--shard", "2/2"], { work: wide })
    const lines = (text: string) => text.split("\n").filter(Boolean)
    expect(first.code).toBe(0)
    expect([...lines(first.stdout), ...lines(second.stdout)].sort()).toEqual([...all].sort())
    expect(lines(first.stdout).length).toBeGreaterThan(0)
  })

  it("reports the shard in json, with only its targets", async () => {
    const { stdout } = await invoke(["--json", "--shard", "1/2"], { work: wide })
    const report = JSON.parse(stdout) as { mutateTargets: string[]; shard: object }
    expect(report.shard).toEqual({ index: 1, total: 2 })
    expect(report.mutateTargets.length).toBe(1)
  })

  it("shows the shard's targets in the text report", async () => {
    const { stdout } = await invoke(["--shard", "2/2"], { work: wide })
    expect(stdout).toContain("mutation targets (1, shard 2/2):")
  })

  it("balances by the timings file", async () => {
    const all = await targets()
    const heavy = all.at(-1)!
    const timings = JSON.stringify({ [heavy]: 1_000_000, [all[0]!]: 1 })
    const { stdout } = await invoke(
      ["--mutate", "--shard", "1/2", "--timings", "t.json"],
      { work: wide },
      {
        createCapabilities: () => {
          const { capabilities } = fakeGit({ base, work: wide })
          return {
            ...capabilities,
            readFile: async (name: string) =>
              name === "t.json" ? timings : capabilities.readFile(name),
          }
        },
      },
    )
    expect(stdout.split("\n").filter(Boolean)).toEqual([heavy])
  })

  it("fails when the timings file is missing or not a record of numbers", async () => {
    const missing = await invoke(["--mutate", "--shard", "1/2", "--timings", "nope.json"], {
      work: wide,
    })
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain("could not read timings file nope.json")
    for (const text of ["{", "[]", '{"a": "x"}', '{"a": -1}']) {
      const bad = await invoke(
        ["--mutate", "--shard", "1/2", "--timings", "t.json"],
        { work: wide },
        {
          createCapabilities: () => {
            const { capabilities } = fakeGit({ base, work: wide })
            return {
              ...capabilities,
              readFile: async (n: string) => (n === "t.json" ? text : capabilities.readFile(n)),
            }
          },
        },
      )
      expect(bad.code).toBe(1)
      expect(bad.stderr).toContain(
        "timings file t.json must be a JSON object of file to milliseconds",
      )
    }
  })

  it("plans a matrix from a shard count", async () => {
    const { code, stdout } = await invoke(["--plan-shards", "--shards", "2"], { work: wide })
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({
      count: 2,
      include: [
        { shard: 1, total: 2, spec: "1/2" },
        { shard: 2, total: 2, spec: "2/2" },
      ],
    })
  })

  it("plans a single shard when nothing needs mutating", async () => {
    const { stdout } = await invoke(["--plan-shards", "--shards", "4"], { work: base })
    expect(JSON.parse(stdout)).toEqual({ count: 1, include: [{ shard: 1, total: 1, spec: "1/1" }] })
  })

  it("sizes the matrix from the time budget", async () => {
    const all = await targets()
    const timings = JSON.stringify(Object.fromEntries(all.map((f) => [f, 600_000])))
    const { stdout } = await invoke(
      ["--plan-shards", "--target-minutes", "10", "--timings", "t.json"],
      { work: wide },
      {
        createCapabilities: () => {
          const { capabilities } = fakeGit({ base, work: wide })
          return {
            ...capabilities,
            readFile: async (n: string) => (n === "t.json" ? timings : capabilities.readFile(n)),
          }
        },
      },
    )
    expect((JSON.parse(stdout) as { count: number }).count).toBe(all.length)
  })
})
