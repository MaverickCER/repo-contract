import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  CAUGHT_ALONE,
  MUTATION_USAGE,
  parseMutationArgs,
  runMutation,
} from "../../../bin/mutation-cli.mjs"
import * as affected from "../../../src/affected/index.js"
import * as helpers from "../../../src/helpers/index.js"

const root = mkdtempSync(path.join(tmpdir(), "rc-mutation-cli-"))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const REPORT = "reports/mutation/mutation.json"
const INCREMENTAL = "reports/mutation/stryker-incremental.json"
const CONFIG = {
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
  jsonReporter: { fileName: REPORT },
  incrementalFile: INCREMENTAL,
}

let projects = 0
/**
 * @param files - path to text, relative to the project.
 * @param config - the Stryker config, written as stryker.config.json; `null` writes none.
 * @returns the project directory.
 */
function project(files: Record<string, string>, config: object | null = CONFIG): string {
  projects += 1
  const dir = path.join(root, `p${String(projects)}`)
  for (const [file, text] of Object.entries({
    ...(config === null ? {} : { "stryker.config.json": JSON.stringify(config) }),
    ...files,
  })) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

const SOURCES = {
  "src/a.ts": "export const a = (x: number) => x + 1\n",
  "src/b.ts": "export const b = 2\n".repeat(4),
  "src/c.ts": "export const c = 3\n".repeat(9),
  "src/a.test.ts": "test\n",
}

interface Mutant {
  status: string
  mutatorName?: string
  replacement?: string
  statusReason?: string
  testsCompleted?: number
  location: { start: { line: number; column: number }; end: { line: number; column: number } }
}

const at = (line: number, column = 1) => ({
  start: { line, column },
  end: { line, column: column + 1 },
})

/**
 * @param dir - the project.
 * @param statuses - each mutated file's mutant statuses; a file maps to its own list.
 * @returns a Stryker report whose sources are the files on disk.
 */
function reportFor(dir: string, statuses: Record<string, readonly string[]>) {
  return {
    schemaVersion: "2",
    files: Object.fromEntries(
      Object.entries(statuses).map(([file, list]) => [
        file,
        {
          language: "typescript",
          source: readFileSync(path.join(dir, file), "utf8"),
          mutants: list.map((status, index): Mutant => ({
            status,
            mutatorName: "M",
            replacement: "r",
            testsCompleted: 1,
            location: at(index + 1),
          })),
        },
      ]),
    ),
  }
}

interface StrykerReport {
  files: Record<string, { mutants: Mutant[] }>
}

type Behaviour = (args: readonly string[], cwd: string) => number | null

interface Call {
  readonly args: readonly string[]
  readonly quiet: boolean
}

/**
 * @param dir - a project.
 * @returns every file in it except node_modules and reports, as git ls-files -z would list them.
 */
function listing(dir: string): string {
  const walk = (at: string): string[] =>
    readdirSync(path.join(dir, at), { withFileTypes: true }).flatMap((entry) => {
      const relative = at === "" ? entry.name : `${at}/${entry.name}`
      if (entry.name === "node_modules") return []
      return entry.isDirectory() ? walk(relative) : [relative]
    })
  return walk("").join("\0")
}

/**
 * Runs the command with a fake Stryker.
 * @param dir - the project.
 * @param argv - the arguments after `mutation`.
 * @param behaviour - what each Stryker call does; returns its exit code.
 * @param extra - more input.
 * @returns the exit code, the output and the Stryker calls.
 */
async function invoke(
  dir: string,
  argv: readonly string[],
  behaviour: Behaviour = () => 0,
  extra: Record<string, unknown> = {},
) {
  const calls: Call[] = []
  const stdout: string[] = []
  const stderr: string[] = []
  const code = await runMutation({
    argv,
    cwd: dir,
    version: "9.9.9",
    stdout: (text: string) => stdout.push(text),
    stderr: (text: string) => stderr.push(text),
    affected,
    helpers,
    stryker: (args: readonly string[], options: { cwd: string; quiet: boolean }) => {
      calls.push({ args, quiet: options.quiet })
      return Promise.resolve({ exitCode: behaviour(args, options.cwd) })
    },
    git: () => Promise.resolve(listing(dir)),
    now: () => new Date("2026-11-16T12:00:00Z"),
    ...extra,
  })
  const out = stdout.join("")
  return {
    code,
    stdout: out,
    stderr: stderr.join(""),
    calls,
    json: () => JSON.parse(out) as Record<string, unknown>,
  }
}

/**
 * @param dir - the project.
 * @param report - the report the fake Stryker writes.
 * @returns a behaviour that writes it where the config says.
 */
const writes =
  (dir: string, report: unknown, exitCode = 0): Behaviour =>
  () => {
    mkdirSync(path.join(dir, "reports/mutation"), { recursive: true })
    writeFileSync(path.join(dir, REPORT), JSON.stringify(report))
    return exitCode
  }

const mutateArg = (call: Call | undefined): string | undefined => {
  const index = call?.args.indexOf("--mutate") ?? -1
  return index === -1 ? undefined : call?.args[index + 1]
}

describe("parseMutationArgs", () => {
  it.each([
    [["--help"], { kind: "help" }],
    [["run", "-h"], { kind: "help" }],
    [["-V"], { kind: "version" }],
    [[], { kind: "error", message: "a subcommand is required: plan or run" }],
    [["go"], { kind: "error", message: "unknown subcommand 'go': use plan or run" }],
    [["plan", "--shard", "1/2"], { kind: "error", message: "unknown option '--shard'" }],
    [["run", "--frob"], { kind: "error", message: "unknown option '--frob'" }],
    [["run", "extra"], { kind: "error", message: "unexpected argument 'extra'" }],
    [["run", "--shard"], { kind: "error", message: "option '--shard' needs a value" }],
    [["run", "--config", "--json"], { kind: "error", message: "option '--config' needs a value" }],
    [["run", "--json=yes"], { kind: "error", message: "option '--json' does not take a value" }],
    [
      ["run", "--no-patch-vitest-runner=1"],
      { kind: "error", message: "option '--no-patch-vitest-runner' does not take a value" },
    ],
    [
      ["plan", "--no-patch-vitest-runner"],
      { kind: "error", message: "unknown option '--no-patch-vitest-runner'" },
    ],
    [
      ["run", "--shard", "3/2"],
      { kind: "error", message: "option '--shard' needs <index>/<total> with 1 <= index <= total" },
    ],
    [
      ["run", "--cache", "on"],
      { kind: "error", message: "option '--cache' needs read-write, read-only or off" },
    ],
    [
      ["run", "--confirm-timeouts", "-1"],
      { kind: "error", message: "option '--confirm-timeouts' needs a value" },
    ],
    [
      ["run", "--confirm-timeouts", "two"],
      { kind: "error", message: "option '--confirm-timeouts' needs a whole number" },
    ],
    [
      ["run", "--report", "r.json", "--shard", "1/2"],
      { kind: "error", message: "options '--report' and '--shard' cannot be used together" },
    ],
  ])("parses %j", (argv, expected) => {
    expect(parseMutationArgs(argv)).toEqual(expected)
  })

  it("reads plan's options", () => {
    expect(parseMutationArgs(["plan", "--json", "--config=s.json", "-C", "pkg"])).toEqual({
      kind: "plan",
      options: { json: true, config: "s.json", cwd: "pkg" },
    })
  })

  it("reads run's options with their defaults", () => {
    expect(parseMutationArgs(["run"])).toEqual({
      kind: "run",
      options: { json: false, cache: "off", confirmTimeouts: 5, patchVitestRunner: true },
    })
    expect(
      parseMutationArgs([
        "run",
        "--json",
        "--shard=2/3",
        "--mutate",
        "src/a.ts,src/b.ts",
        "--config",
        "s.mjs",
        "--cache",
        "read-only",
        "--confirm-timeouts",
        "0",
        "-C",
        "pkg",
        "--no-patch-vitest-runner",
      ]),
    ).toEqual({
      kind: "run",
      options: {
        patchVitestRunner: false,
        json: true,
        shard: "2/3",
        mutate: ["src/a.ts", "src/b.ts"],
        config: "s.mjs",
        cache: "read-only",
        confirmTimeouts: 0,
        cwd: "pkg",
      },
    })
  })

  it("reads --mutate= as an empty list", () => {
    expect(parseMutationArgs(["run", "--mutate="])).toMatchObject({ options: { mutate: [] } })
  })
})

describe("repo-contract mutation", () => {
  it("prints usage for --help", async () => {
    const result = await invoke(root, ["--help"])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(`${MUTATION_USAGE}\n`)
    expect(MUTATION_USAGE).toContain("repo-contract mutation run")
  })

  it("prints the version for --version", async () => {
    expect((await invoke(root, ["-V"])).stdout).toBe("9.9.9\n")
  })

  it("rejects an unknown subcommand or flag with exit 2", async () => {
    for (const argv of [["go"], ["run", "--frob"]]) {
      const result = await invoke(root, argv)
      expect(result.code).toBe(2)
      expect(result.stdout).toBe("")
      expect(result.stderr).toMatch(
        /^repo-contract mutation: .*\nTry 'repo-contract mutation --help'/,
      )
    }
  })
})

describe("repo-contract mutation plan", () => {
  it("plan --json prints files, bytes, count and the matrix for the Stryker config's mutate set", async () => {
    const big = "x".repeat(70_000)
    const dir = project({ ...SOURCES, "src/big.ts": big })
    const result = await invoke(dir, ["plan", "--json"])
    expect(result.code).toBe(0)
    const sizes = ["src/a.ts", "src/b.ts", "src/big.ts", "src/c.ts"].map((file) => ({
      path: file,
      bytes: Buffer.byteLength(readFileSync(path.join(dir, file))),
    }))
    const expected = affected.planMutationShards(sizes)
    expect(result.json()).toEqual({
      schemaVersion: 1,
      config: "stryker.config.json",
      files: 4,
      bytes: expected.bytes,
      count: 2,
      shards: expected.plan.shards,
      matrix: expected.matrix,
    })
    expect(result.calls).toEqual([])
  })

  it("reads an ES module config and the --config and -C options", async () => {
    const dir = project(
      {
        ...SOURCES,
        "conf/mine.mjs": 'export default { mutate: ["src/b.ts"] }\n',
      },
      null,
    )
    const result = await invoke(root, ["plan", "--json", "--config", "conf/mine.mjs", "-C", dir])
    expect(result.json()).toMatchObject({ config: "conf/mine.mjs", files: 1, count: 1 })
  })

  it("finds stryker.conf.mjs when there is no stryker.config.*", async () => {
    const dir = project(
      { ...SOURCES, "stryker.conf.mjs": 'export default { mutate: ["src/c.ts"] }\n' },
      null,
    )
    expect((await invoke(dir, ["plan", "--json"])).json()).toMatchObject({
      config: "stryker.conf.mjs",
      files: 1,
    })
  })

  it("expands line ranges, negations and Stryker's default mutate set", async () => {
    const ranges = project({ ...SOURCES }, { mutate: ["src/a.ts:1-2", "src/a.ts:4-5", "src/c.ts"] })
    expect((await invoke(ranges, ["plan", "--json"])).json()).toMatchObject({
      shards: [["src/a.ts:1-2,src/a.ts:4-5", "src/c.ts"]],
    })
    const defaults = project({ ...SOURCES, "lib/d.js": "d\n", "src/e.spec.ts": "e\n" }, {})
    expect((await invoke(defaults, ["plan", "--json"])).json()).toMatchObject({ files: 4 })
  })

  it("prints a summary without --json", async () => {
    const dir = project(SOURCES)
    const result = await invoke(dir, ["plan"])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(
      /^stryker\.config\.json mutates 3 file\(s\), \d+ bytes: 1 shard\(s\)\.\n/,
    )
  })

  it("exits 1 when the config cannot be read or selects no file", async () => {
    const none = project(SOURCES, null)
    const missing = await invoke(none, ["plan", "--json"])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toBe(
      "repo-contract mutation: no Stryker config found: pass --config, or add stryker.config.mjs (or .js, .cjs, .json, or stryker.conf.*)\n",
    )
    const broken = project({ ...SOURCES, "stryker.config.json": "{" }, null)
    expect((await invoke(broken, ["plan"])).stderr).toMatch(
      /^repo-contract mutation: cannot load stryker\.config\.json: /,
    )
    const empty = project(SOURCES, { mutate: ["nothing/**"] })
    const selectsNothing = await invoke(empty, ["plan", "--json"])
    expect(selectsNothing.code).toBe(1)
    expect(selectsNothing.stderr).toBe(
      "repo-contract mutation: stryker.config.json selects no file to mutate\n",
    )
  })
})

describe("repo-contract mutation run", () => {
  it("run --json runs Stryker cold with --force and prints a ran report", async () => {
    const dir = project({ ...SOURCES, [INCREMENTAL]: "{}", [REPORT]: "stale" })
    let seen: { incremental: boolean; report: boolean } | undefined
    const result = await invoke(dir, ["run", "--json"], (args, cwd) => {
      seen = {
        incremental: existsSync(path.join(cwd, INCREMENTAL)),
        report: existsSync(path.join(cwd, REPORT)),
      }
      return writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] }))(args, cwd)
    })
    expect(seen).toEqual({ incremental: false, report: false })
    expect(result.calls).toEqual([
      {
        args: ["run", "stryker.config.json", "--force", "--reporters", "json,clear-text"],
        quiet: false,
      },
    ])
    expect(result.code).toBe(0)
    expect(result.json()).toEqual({
      schemaVersion: 1,
      state: "ran",
      report: REPORT,
      exitCode: 0,
      shard: null,
      mutate: null,
      timeouts: { rerun: 0, caught: 0 },
      inputs: null,
      message: "Stryker ran every mutant cold.",
    })
  })

  it("passes Stryker's exit code through", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Survived"] }), 3),
    )
    expect(result.code).toBe(3)
    expect(result.json()).toMatchObject({ state: "ran", exitCode: 3 })
  })

  it("removes Stryker's sandbox afterwards", async () => {
    const dir = project({ ...SOURCES, ".stryker-tmp/sandbox-1/x": "x" })
    await invoke(dir, ["run", "--json"], writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })))
    expect(existsSync(path.join(dir, ".stryker-tmp"))).toBe(false)
  })

  it("removes a tempDirName nested inside the project", async () => {
    const dir = project(
      { ...SOURCES, "build/tmp/sandbox-1/x": "x", "build/keep.txt": "keep" },
      { ...CONFIG, tempDirName: "build/tmp" },
    )
    await invoke(dir, ["run", "--json"], writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })))
    expect(existsSync(path.join(dir, "build/tmp"))).toBe(false)
    expect(readFileSync(path.join(dir, "build/keep.txt"), "utf8")).toBe("keep")
  })

  it("prints an error report when Stryker writes no report or cannot start", async () => {
    const dir = project(SOURCES)
    const silent = await invoke(dir, ["run", "--json"], () => 1)
    expect(silent.code).toBe(1)
    expect(silent.json()).toMatchObject({
      state: "error",
      exitCode: 1,
      message: `Stryker exited 1 without writing ${REPORT}. Its output is above, on stderr.`,
    })
    const missing = await invoke(dir, ["run", "--json"], () => 0, {
      stryker: () => Promise.resolve({ exitCode: null, error: "spawn stryker ENOENT" }),
    })
    expect(missing.code).toBe(1)
    expect(missing.json()).toMatchObject({
      state: "error",
      exitCode: null,
      message:
        "Stryker could not start (spawn stryker ENOENT). Install @stryker-mutator/core as a development dependency.",
    })
  })

  it("prints an error report when there is no Stryker config", async () => {
    const dir = project(SOURCES, null)
    const result = await invoke(dir, ["run", "--json"])
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({ state: "error", report: "" })
    expect(result.json().message).toContain("no Stryker config found")
  })

  it("prints the message alone without --json", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.stdout).toBe("Stryker ran every mutant cold.\n")
  })

  it("run --shard i/n mutates one slice planned by size", async () => {
    const dir = project({ ...SOURCES, "src/big.ts": "x".repeat(70_000) })
    const plan = (await invoke(dir, ["plan", "--json"])).json() as { shards: string[][] }
    for (const [index, files] of plan.shards.entries()) {
      const spec = `${String(index + 1)}/${String(plan.shards.length)}`
      const result = await invoke(
        dir,
        ["run", "--json", "--shard", spec],
        writes(dir, reportFor(dir, { [files[0]!]: ["Killed"] })),
      )
      expect(mutateArg(result.calls[0])).toBe(files.join(","))
      expect(result.json()).toMatchObject({ state: "ran", shard: spec, mutate: null })
      expect(result.json().message).toBe(
        `Stryker ran shard ${spec} cold: ${String(files.length)} file(s).`,
      )
    }
  })

  it("refuses a shard count above the number of files", async () => {
    const dir = project(SOURCES)
    const result = await invoke(dir, ["run", "--json", "--shard", "1/4"])
    expect(result.code).toBe(1)
    expect(result.calls).toEqual([])
    expect(result.json()).toMatchObject({
      state: "error",
      message: "--shard 1/4 asks for 4 shards, but only 3 file(s) are mutated.",
    })
  })

  it("run --mutate restricts the run, and an empty list prints nothing-to-mutate", async () => {
    const dir = project(SOURCES)
    const restricted = await invoke(
      dir,
      ["run", "--json", "--mutate", "src/b.ts,src/c.ts"],
      writes(dir, reportFor(dir, { "src/b.ts": ["Killed"] })),
    )
    expect(mutateArg(restricted.calls[0])).toBe("src/b.ts,src/c.ts")
    expect(restricted.json()).toMatchObject({ state: "ran", mutate: ["src/b.ts", "src/c.ts"] })

    const sharded = await invoke(
      dir,
      ["run", "--json", "--mutate", "src/b.ts,src/c.ts", "--shard", "2/2"],
      writes(dir, reportFor(dir, { "src/b.ts": ["Killed"] })),
    )
    expect(["src/b.ts", "src/c.ts"]).toContain(mutateArg(sharded.calls[0]))

    const empty = await invoke(dir, ["run", "--json", "--mutate="])
    expect(empty.code).toBe(0)
    expect(empty.calls).toEqual([])
    expect(empty.json()).toEqual({
      schemaVersion: 1,
      state: "nothing-to-mutate",
      report: "",
      exitCode: null,
      shard: null,
      mutate: [],
      timeouts: { rerun: 0, caught: 0 },
      inputs: null,
      message: "Nothing to mutate: the mutate list is empty.",
    })
  })
})

describe("repo-contract mutation run: the Vitest 5 runner patch", () => {
  const LEGACY = "const name = nameParts.join(' ').trim()\n"
  const RUNNER = "node_modules/@stryker-mutator/vitest-runner"
  const runnerFiles = ["test-helpers.js", "stryker-setup.js"].map(
    (file) => `${RUNNER}/dist/src/${file}`,
  )
  const installed = () =>
    project({
      ...SOURCES,
      "node_modules/vitest/package.json": JSON.stringify({ version: "5.0.0" }),
      [`${RUNNER}/package.json`]: JSON.stringify({ version: "9.6.1" }),
      ...Object.fromEntries(runnerFiles.map((file) => [file, LEGACY])),
    })

  it("patches the installed runner by default and says so", async () => {
    const dir = installed()
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.code).toBe(0)
    for (const file of runnerFiles) {
      expect(readFileSync(path.join(dir, file), "utf8")).toBe(
        "const name = nameParts.join(' > ').trim()\n",
      )
    }
    expect(result.stderr).toContain(
      "[mutation] Vitest 5.0.0: patched @stryker-mutator/vitest-runner's test-name separator",
    )
  })

  it("leaves a runner hoisted outside the project untouched and says how to patch it", async () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "rc-mutation-hoisted-"))
    try {
      const parentModules = path.join(sandbox, "node_modules")
      const runner = path.join(parentModules, "@stryker-mutator/vitest-runner")
      const files = {
        "vitest/package.json": JSON.stringify({ version: "5.0.0" }),
        "@stryker-mutator/vitest-runner/package.json": "{}",
        "@stryker-mutator/vitest-runner/dist/src/test-helpers.js": LEGACY,
        "@stryker-mutator/vitest-runner/dist/src/stryker-setup.js": LEGACY,
        "canary.txt": "alive",
      }
      for (const [file, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(parentModules, file)), { recursive: true })
        writeFileSync(path.join(parentModules, file), text)
      }
      const dir = path.join(sandbox, "project")
      for (const [file, text] of Object.entries({
        ...SOURCES,
        "stryker.config.json": JSON.stringify(CONFIG),
      })) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        writeFileSync(path.join(dir, file), text)
      }

      const result = await invoke(
        dir,
        ["run", "--json"],
        writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      )

      expect(result.code).toBe(0)
      for (const [file, text] of Object.entries(files)) {
        expect(readFileSync(path.join(parentModules, file), "utf8")).toBe(text)
      }
      expect(result.stderr).toBe(
        `[mutation] Vitest 5.0.0: skipped the stryker-js#6210 patch. The @stryker-mutator/vitest-runner that needs it is at ${runner}, outside this project, so it was left untouched. To apply it, run 'repo-contract mutation run' from the project whose node_modules holds it. Until then, every mutant may run 0 tests.\n`,
      )
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it("--no-patch-vitest-runner leaves node_modules untouched and says so", async () => {
    const dir = installed()
    const result = await invoke(
      dir,
      ["run", "--json", "--no-patch-vitest-runner"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.code).toBe(0)
    for (const file of runnerFiles) expect(readFileSync(path.join(dir, file), "utf8")).toBe(LEGACY)
    expect(result.stderr).toBe(
      "[mutation] --no-patch-vitest-runner: @stryker-mutator/vitest-runner is left as installed. On Vitest 5, a runner without the stryker-js#6210 fix runs 0 tests per mutant.\n",
    )
  })
})

describe("repo-contract mutation run: a path it deletes outside the project", () => {
  // The run deletes tempDirName, incrementalFile and jsonReporter.fileName. Such values once
  // deleted the project, its parent or a file elsewhere. So each case runs three levels deep in a
  // scratch directory of its own, beside a symlink that points out of the project.
  const sandbox = mkdtempSync(path.join(tmpdir(), "rc-mutation-deletes-"))
  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })
  let cases = 0

  /**
   * @returns a project at <case>/parent/project, canaries around it, and a link to <case>/outside.
   */
  function layout() {
    cases += 1
    const outer = path.join(sandbox, `case${String(cases)}`)
    const parent = path.join(outer, "parent")
    const dir = path.join(parent, "project")
    const outside = path.join(outer, "outside")
    const canaries = [dir, parent, outer, outside, path.join(outside, "sub")].map((at) =>
      path.join(at, "canary.txt"),
    )
    for (const canary of canaries) {
      mkdirSync(path.dirname(canary), { recursive: true })
      writeFileSync(canary, "alive")
    }
    for (const [file, text] of Object.entries(SOURCES)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
    symlinkSync(outside, path.join(dir, "link"), "dir")
    return { dir, outside, canaries }
  }

  const SETTINGS = {
    tempDirName: (value: unknown) => ({ tempDirName: value }),
    incrementalFile: (value: unknown) => ({ incrementalFile: value }),
    "jsonReporter.fileName": (value: unknown) => ({ jsonReporter: { fileName: value } }),
  }

  const VALUES: [string, (outside: string) => unknown][] = [
    ["an empty string", () => ""],
    ["the project itself", () => "."],
    ["the project through a trailing slash", () => "./"],
    ["the parent", () => ".."],
    ["a path that climbs out", () => "a/../.."],
    ["the parent's file", () => "../canary.txt"],
    ["an absolute directory", (outside) => outside],
    ["an absolute file", (outside) => path.join(outside, "canary.txt")],
    ["a symlink out of the project", () => "link"],
    ["a file through that symlink", () => "link/canary.txt"],
    ["a directory through that symlink", () => "link/sub"],
    ["a number", () => 42],
  ]

  it.each(
    Object.keys(SETTINGS).flatMap((setting) =>
      VALUES.map(([label, value]) => [setting, label, value] as const),
    ),
  )("refuses %s as %s with exit 1, runs nothing and deletes nothing", async (setting, _, value) => {
    const { dir, outside, canaries } = layout()
    const chosen = value(outside)
    writeFileSync(
      path.join(dir, "stryker.config.json"),
      JSON.stringify({ ...CONFIG, ...SETTINGS[setting as keyof typeof SETTINGS](chosen) }),
    )

    const result = await invoke(dir, ["run", "--json"], () => 1)

    expect(result.code).toBe(1)
    expect(result.calls).toEqual([])
    expect(result.json()).toMatchObject({ state: "error", exitCode: null })
    expect(result.json().message).toBe(
      `stryker.config.json sets ${setting} to ${JSON.stringify(chosen)}. It must be a relative path inside the project, because the run deletes it. Nothing was run or deleted.`,
    )
    for (const canary of canaries) expect(readFileSync(canary, "utf8")).toBe("alive")
  })

  it("accepts paths through a symlink that stays inside the project", async () => {
    const { dir, canaries } = layout()
    mkdirSync(path.join(dir, "build/tmp/sandbox-1"), { recursive: true })
    symlinkSync(path.join(dir, "build"), path.join(dir, "inside"), "dir")
    writeFileSync(
      path.join(dir, "stryker.config.json"),
      JSON.stringify({
        ...CONFIG,
        tempDirName: "inside/tmp",
        incrementalFile: "inside/incremental.json",
      }),
    )
    writeFileSync(path.join(dir, "build/incremental.json"), "{}")

    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )

    expect(result.json()).toMatchObject({ state: "ran", exitCode: 0 })
    expect(existsSync(path.join(dir, "build/tmp"))).toBe(false)
    expect(existsSync(path.join(dir, "build/incremental.json"))).toBe(false)
    for (const canary of canaries) expect(readFileSync(canary, "utf8")).toBe("alive")
  })
})

describe("repo-contract mutation run --report", () => {
  const merged = (dir: string, statuses: Record<string, readonly string[]>): string => {
    const file = path.join(dir, "merged.json")
    writeFileSync(file, JSON.stringify(reportFor(dir, statuses)))
    return "merged.json"
  }

  it("adopts a report made from this checkout's plan and runs no mutant", async () => {
    const dir = project(SOURCES)
    const report = merged(dir, {
      "src/a.ts": ["Killed"],
      "src/b.ts": ["Killed"],
      "src/c.ts": ["Killed"],
    })
    const result = await invoke(dir, ["run", "--json", "--report", report])
    expect(result.calls).toEqual([])
    expect(result.code).toBe(0)
    expect(result.json()).toMatchObject({
      state: "adopted",
      report: "merged.json",
      exitCode: null,
      message: "Judged merged.json; no mutant was run here.",
    })
  })

  it("adopts a report that lacks only files Stryker finds no mutant in", async () => {
    const dir = project(SOURCES)
    const report = merged(dir, { "src/a.ts": ["Killed"], "src/c.ts": ["Killed"] })
    const asked: string[][] = []
    const result = await invoke(dir, ["run", "--json", "--report", report], undefined, {
      mutantFree: (_cwd: string, files: string[]) => {
        asked.push(files)
        return Promise.resolve(files)
      },
    })
    expect(asked).toEqual([["src/b.ts"]])
    expect(result.json()).toMatchObject({ state: "adopted" })
  })

  it.each([
    [
      "lacks a file with mutants",
      { "src/a.ts": ["Killed"], "src/c.ts": ["Killed"] },
      "merged.json was not made from this checkout's plan: it lacks src/b.ts.",
    ],
    [
      "has a file the run does not mutate",
      {
        "src/a.ts": ["Killed"],
        "src/b.ts": ["Killed"],
        "src/c.ts": ["Killed"],
        "src/a.test.ts": ["Killed"],
      },
      "merged.json was not made from this checkout's plan: it has src/a.test.ts, which this run does not mutate.",
    ],
  ])("refuses a report that %s", async (_name, statuses, message) => {
    const dir = project(SOURCES)
    const report = merged(dir, statuses)
    const result = await invoke(dir, ["run", "--json", "--report", report], undefined, {
      mutantFree: () => Promise.resolve([]),
    })
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({ state: "error", message })
  })

  it("refuses a report whose recorded source differs from the file on disk", async () => {
    const dir = project(SOURCES)
    const report = merged(dir, {
      "src/a.ts": ["Killed"],
      "src/b.ts": ["Killed"],
      "src/c.ts": ["Killed"],
    })
    writeFileSync(path.join(dir, "src/b.ts"), "changed\n")
    const result = await invoke(dir, ["run", "--json", "--report", report])
    expect(result.json()).toMatchObject({
      state: "error",
      message:
        "merged.json was not made from this checkout: src/b.ts differs from the text that was mutated.",
    })
  })

  it("ignores line endings when it compares sources", async () => {
    const dir = project(SOURCES)
    const report = merged(dir, {
      "src/a.ts": ["Killed"],
      "src/b.ts": ["Killed"],
      "src/c.ts": ["Killed"],
    })
    writeFileSync(path.join(dir, "src/b.ts"), SOURCES["src/b.ts"].replace(/\n/g, "\r\n"))
    expect((await invoke(dir, ["run", "--json", "--report", report])).json()).toMatchObject({
      state: "adopted",
    })
  })

  it("judges a report against the --mutate list", async () => {
    const dir = project(SOURCES)
    const report = merged(dir, { "src/b.ts": ["Killed"] })
    expect(
      (await invoke(dir, ["run", "--json", "--report", report, "--mutate", "src/b.ts"])).json(),
    ).toMatchObject({ state: "adopted", mutate: ["src/b.ts"] })
    const none = await invoke(dir, ["run", "--json", "--report", report, "--mutate="])
    expect(none.json()).toMatchObject({
      state: "error",
      message:
        "merged.json cannot be judged: the mutate list is empty, so it can be evidence of nothing.",
    })
  })

  it.each([
    ["absent.json", undefined, "absent.json cannot be read as a mutation report"],
    ["bad.json", "{", "bad.json cannot be read as a mutation report"],
    [
      "shape.json",
      JSON.stringify({ files: {} }),
      "shape.json is not a mutation report: it has no file in it.",
    ],
    [
      "status.json",
      JSON.stringify({ files: { "src/a.ts": { mutants: [{ status: "Bogus" }] } } }),
      'status.json is not a mutation report: src/a.ts has a mutant whose status is "Bogus", which Stryker does not report.',
    ],
    [
      "mutants.json",
      JSON.stringify({ files: { "src/a.ts": { mutants: null } } }),
      "mutants.json is not a mutation report: src/a.ts has no `mutants` array.",
    ],
  ])("refuses %s", async (name, text, message) => {
    const dir = project(SOURCES)
    if (text !== undefined) writeFileSync(path.join(dir, name), text)
    const result = await invoke(dir, ["run", "--json", "--report", name])
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({ state: "error" })
    expect(result.json().message).toContain(message)
  })
})

describe("repo-contract mutation run: timeouts", () => {
  /**
   * @param dir - the project.
   * @param rerunStatus - what a mutant re-run alone ends as, by line.
   * @returns a behaviour: the full run has two timeouts on lines 1 and 2; a re-run reports its line.
   */
  const timeoutsThen =
    (dir: string, rerunStatus: Record<number, string>): Behaviour =>
    (args, cwd) => {
      const target = mutateArg({ args, quiet: false })
      if (target === undefined) {
        return writes(dir, reportFor(dir, { "src/c.ts": ["Timeout", "Timeout", "Killed"] }))(
          args,
          cwd,
        )
      }
      const line = Number(/:(\d+)-/.exec(target)?.[1])
      const report = reportFor(dir, { "src/c.ts": ["Killed", "Killed", "Killed"] })
      const mutant = report.files["src/c.ts"]!.mutants[line - 1]!
      const status = rerunStatus[line]
      if (status === undefined) return 1
      mutant.status = status
      report.files["src/c.ts"]!.mutants = [mutant]
      return writes(dir, report)(args, cwd)
    }

  it("re-runs at most --confirm-timeouts timed-out mutants alone and rewrites the caught ones", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json"],
      timeoutsThen(dir, { 1: "Killed", 2: "Timeout" }),
    )
    expect(result.calls.slice(1)).toEqual([
      {
        args: [
          "run",
          "stryker.config.json",
          "--force",
          "--reporters",
          "json",
          "--concurrency",
          "1",
          "--mutate",
          "src/c.ts:1-1",
        ],
        quiet: true,
      },
      {
        args: [
          "run",
          "stryker.config.json",
          "--force",
          "--reporters",
          "json",
          "--concurrency",
          "1",
          "--mutate",
          "src/c.ts:2-2",
        ],
        quiet: true,
      },
    ])
    expect(result.json()).toMatchObject({ state: "ran", timeouts: { rerun: 2, caught: 1 } })
    const report = JSON.parse(readFileSync(path.join(dir, REPORT), "utf8")) as StrykerReport
    expect(
      report.files["src/c.ts"]?.mutants.map((m: Mutant) => [m.status, m.statusReason]),
    ).toEqual([
      ["Killed", "timed out in the full run and was caught when run alone"],
      ["Timeout", undefined],
      ["Killed", undefined],
    ])
  })

  it("keeps a timeout whose re-run wrote no report", async () => {
    const dir = project(SOURCES)
    const result = await invoke(dir, ["run", "--json"], timeoutsThen(dir, {}))
    expect(result.json()).toMatchObject({ timeouts: { rerun: 2, caught: 0 } })
    const report = JSON.parse(readFileSync(path.join(dir, REPORT), "utf8")) as StrykerReport
    expect(report.files["src/c.ts"]?.mutants).toHaveLength(3)
  })

  it("leaves more timeouts than the limit as they are", async () => {
    const dir = project(SOURCES)
    for (const limit of ["1", "0"]) {
      const result = await invoke(
        dir,
        ["run", "--json", "--confirm-timeouts", limit],
        timeoutsThen(dir, { 1: "Killed", 2: "Killed" }),
      )
      expect(result.calls).toHaveLength(1)
      expect(result.json()).toMatchObject({ timeouts: { rerun: 0, caught: 0 } })
    }
  })
})

describe("repo-contract mutation run: cache", () => {
  const cacheDir = (dir: string) => path.join(dir, ".repo-contract/cache")

  it("run --cache read-write replays a clean run when the inputs are unchanged", async () => {
    const dir = project(SOURCES)
    const clean = reportFor(dir, { "src/a.ts": ["Killed", "Ignored"] })
    const first = await invoke(dir, ["run", "--json", "--cache", "read-write"], writes(dir, clean))
    expect(first.json().state).toBe("ran")
    expect(first.json().inputs).toMatch(/^[0-9a-f]{64}$/)

    rmSync(path.join(dir, REPORT))
    const second = await invoke(dir, ["run", "--json", "--cache", "read-write"])
    expect(second.calls).toEqual([])
    expect(second.code).toBe(0)
    expect(second.json()).toMatchObject({
      state: "reused",
      exitCode: null,
      inputs: first.json().inputs,
      message: `Reused a clean run: nothing it depends on has changed (inputs ${String(first.json().inputs).slice(0, 12)}).`,
    })
    expect(JSON.parse(readFileSync(path.join(dir, REPORT), "utf8"))).toEqual(clean)

    const readOnly = await invoke(dir, ["run", "--json", "--cache", "read-only"])
    expect(readOnly.json()).toMatchObject({ state: "reused" })
  })

  it("misses when a file, the restriction or the config changes", async () => {
    const dir = project(SOURCES)
    const clean = writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] }))
    const key = async (argv: string[]) =>
      (await invoke(dir, ["run", "--json", "--cache", "read-write", ...argv], clean)).json()
    const base = await key([])
    expect(await key([])).toMatchObject({ state: "reused", inputs: base.inputs })
    expect(await key(["--mutate", "src/a.ts"])).toMatchObject({ state: "ran" })
    writeFileSync(path.join(dir, "src/b.ts"), "changed\n")
    const changed = await key([])
    expect(changed).toMatchObject({ state: "ran" })
    expect(changed.inputs).not.toBe(base.inputs)
    writeFileSync(
      path.join(dir, "stryker.config.json"),
      JSON.stringify({ ...CONFIG, concurrency: 2 }),
    )
    expect(await key([])).toMatchObject({ state: "ran" })
  })

  it("never keeps a run with a survivor, a timeout or a non-zero exit", async () => {
    for (const [statuses, exit] of [
      [["Survived"], 0],
      [["NoCoverage"], 0],
      [["Killed"], 1],
    ] as const) {
      const dir = project(SOURCES)
      const behaviour = writes(dir, reportFor(dir, { "src/a.ts": statuses }), exit)
      await invoke(
        dir,
        ["run", "--json", "--cache", "read-write", "--confirm-timeouts", "0"],
        behaviour,
      )
      const again = await invoke(dir, ["run", "--json", "--cache", "read-write"], behaviour)
      expect(again.json()).toMatchObject({ state: "ran" })
    }
  })

  it("run --cache read-only never writes, and --cache off never reads or writes", async () => {
    const dir = project(SOURCES)
    const clean = writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] }))
    const readOnly = await invoke(dir, ["run", "--json", "--cache", "read-only"], clean)
    expect(readOnly.json().state).toBe("ran")
    expect(typeof readOnly.json().inputs).toBe("string")
    expect(existsSync(cacheDir(dir))).toBe(false)

    const off = await invoke(dir, ["run", "--json"], clean)
    expect(off.json()).toMatchObject({ state: "ran", inputs: null })
    expect(existsSync(cacheDir(dir))).toBe(false)

    await invoke(dir, ["run", "--json", "--cache", "read-write"], clean)
    expect(existsSync(cacheDir(dir))).toBe(true)
    const offAgain = await invoke(dir, ["run", "--json", "--cache", "off"], clean)
    expect(offAgain.json()).toMatchObject({ state: "ran" })
  })

  it("runs without the cache when git cannot list the files", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json", "--cache", "read-write"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      { git: () => Promise.resolve(undefined) },
    )
    expect(result.json()).toMatchObject({ state: "ran", inputs: null })
    expect(result.stderr).toContain("the cache is off for this run: git cannot list the files")
  })
})

const repository = path.resolve(__dirname, "../../..")
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")
const parseError = (text: string) => {
  try {
    JSON.parse(text)
  } catch (error) {
    return (error as Error).message
  }
  return "parsed"
}

describe("parseMutationArgs: edge cases", () => {
  const SHARD_ERROR = "option '--shard' needs <index>/<total> with 1 <= index <= total"
  const COUNT_ERROR = "option '--confirm-timeouts' needs a whole number"

  it.each([
    [["run", "--shard", "abc"], SHARD_ERROR],
    [["run", "--shard", "0/2"], SHARD_ERROR],
    [["run", "--confirm-timeouts", "5x"], COUNT_ERROR],
    [["run", "--confirm-timeouts", "x5"], COUNT_ERROR],
    [["run", "-C=pkg"], "unknown option '-C=pkg'"],
    [["run", "--config="], "option '--config' needs a value"],
    [["run", "--report="], "option '--report' needs a value"],
    [["run", "--mutate", ""], "option '--mutate' needs a value"],
  ])("rejects %j", (argv, message) => {
    expect(parseMutationArgs(argv)).toStrictEqual({ kind: "error", message })
  })

  it("reads --version anywhere, and a multi-digit --confirm-timeouts", () => {
    expect(parseMutationArgs(["--version"])).toStrictEqual({ kind: "version" })
    expect(parseMutationArgs(["plan", "--version"])).toStrictEqual({ kind: "version" })
    expect(parseMutationArgs(["run", "--confirm-timeouts", "12"])).toMatchObject({
      options: { confirmTimeouts: 12 },
    })
  })

  it("gives plan and run exactly their defaults", () => {
    expect(parseMutationArgs(["plan"])).toStrictEqual({ kind: "plan", options: { json: false } })
    expect(parseMutationArgs(["run"])).toStrictEqual({
      kind: "run",
      options: { json: false, cache: "off", confirmTimeouts: 5, patchVitestRunner: true },
    })
  })
})

describe("repo-contract mutation: the Stryker config", () => {
  it("parses a JSON config as JSON", async () => {
    const broken = project({ ...SOURCES, "stryker.config.json": "{" }, null)
    expect((await invoke(broken, ["plan"])).stderr).toBe(
      `repo-contract mutation: cannot load stryker.config.json: ${parseError("{")}\n`,
    )
  })

  it.each([
    ["stryker.config.json", "null"],
    ["stryker.config.json", "42"],
    ["stryker.config.mjs", "export default 42\n"],
  ])("refuses %s holding %j", async (file, text) => {
    const dir = project({ ...SOURCES, [file]: text }, null)
    const result = await invoke(dir, ["plan"])
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      `repo-contract mutation: ${file} does not export a Stryker config object\n`,
    )
  })

  it("mutates files, never the directories a pattern matches", async () => {
    const dir = project({ ...SOURCES, "src/sub/d.ts": "d\n" }, { mutate: ["src/**"] })
    const plan = (await invoke(dir, ["plan", "--json"])).json() as { shards: string[][] }
    expect(plan.shards.flat().sort()).toEqual([
      "src/a.test.ts",
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/sub/d.ts",
    ])
  })

  it.each([[["src/a.ts", "src/a.ts:1-2"]], [["src/a.ts:1-2", "src/a.ts"]]])(
    "mutates a file whole when a pattern names it whole: %j",
    async (mutate) => {
      const dir = project(SOURCES, { mutate })
      expect((await invoke(dir, ["plan", "--json"])).json()).toMatchObject({
        shards: [["src/a.ts"]],
      })
    },
  )

  it("prints each shard's files in the text plan", async () => {
    const dir = project({ ...SOURCES, "src/big.ts": "x".repeat(70_000) })
    const plan = (await invoke(dir, ["plan", "--json"])).json() as {
      shards: string[][]
      bytes: number
    }
    const result = await invoke(dir, ["plan"])
    expect(result.stdout).toBe(
      [
        `stryker.config.json mutates 4 file(s), ${String(plan.bytes)} bytes: 2 shard(s).`,
        `  1/2: ${plan.shards[0]!.join(" ")}`,
        `  2/2: ${plan.shards[1]!.join(" ")}`,
        "",
      ].join("\n"),
    )
    expect(plan.shards.some((files) => files.length > 1)).toBe(true)
  })

  it("defaults the report and incremental file when the config names neither", async () => {
    const dir = project(
      { ...SOURCES, "reports/stryker-incremental.json": "{}" },
      { mutate: ["src/a.ts"] },
    )
    const result = await invoke(dir, ["run", "--json"], (args, cwd) => {
      expect(existsSync(path.join(cwd, "reports/stryker-incremental.json"))).toBe(false)
      return writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] }))(args, cwd)
    })
    expect(result.json()).toMatchObject({ state: "ran", report: "reports/mutation/mutation.json" })
  })

  it("says nothing on stderr when the runner needs no patch", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.stderr).toBe("")
  })

  it("names stryker-js#6210 when it does not recognise the installed runner", async () => {
    const runner = "node_modules/@stryker-mutator/vitest-runner"
    const dir = project({
      ...SOURCES,
      "node_modules/vitest/package.json": JSON.stringify({ version: "5.1.0" }),
      [`${runner}/package.json`]: "{}",
      [`${runner}/dist/src/test-helpers.js`]: "something else\n",
      [`${runner}/dist/src/stryker-setup.js`]: "something else\n",
    })
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.stderr).toBe(
      "[mutation] Vitest 5.1.0 with an @stryker-mutator/vitest-runner this package does not recognise: if every mutant survives having run 0 tests, see stryker-js#6210.\n",
    )
  })
})

describe("repo-contract mutation run: endings", () => {
  const sandboxed = () => project({ ...SOURCES, ".stryker-tmp/sandbox-1/x": "x" })

  it("removes the sandbox when Stryker cannot start", async () => {
    const dir = sandboxed()
    await invoke(dir, ["run", "--json"], () => 0, {
      stryker: () => Promise.resolve({ exitCode: null, error: "spawn stryker ENOENT" }),
    })
    expect(existsSync(path.join(dir, ".stryker-tmp"))).toBe(false)
  })

  it("removes the sandbox when Stryker writes no report", async () => {
    const dir = sandboxed()
    await invoke(dir, ["run", "--json"], () => 1)
    expect(existsSync(path.join(dir, ".stryker-tmp"))).toBe(false)
  })

  it("says how many files a --mutate run covered", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json", "--mutate", "src/a.ts,src/b.ts"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.json().message).toBe("Stryker ran 2 file(s) cold.")
  })

  it("prints every field of an error report", async () => {
    const dir = project(SOURCES, null)
    expect((await invoke(dir, ["run", "--json"])).json()).toEqual({
      schemaVersion: 1,
      state: "error",
      report: "",
      exitCode: null,
      shard: null,
      mutate: null,
      timeouts: { rerun: 0, caught: 0 },
      inputs: null,
      message:
        "no Stryker config found: pass --config, or add stryker.config.mjs (or .js, .cjs, .json, or stryker.conf.*)",
    })
  })
})

describe("repo-contract mutation run --report: what a report must hold", () => {
  const all = { "src/a.ts": ["Killed"], "src/b.ts": ["Killed"], "src/c.ts": ["Killed"] }

  it.each([
    ["null", "it has no `files` object."],
    [JSON.stringify({ files: null }), "it has no `files` object."],
    [JSON.stringify({ files: "src/a.ts" }), "it has no `files` object."],
    [JSON.stringify({ files: [] }), "it has no `files` object."],
    [JSON.stringify({ files: { "src/a.ts": null } }), "src/a.ts has no `mutants` array."],
    [
      JSON.stringify({ files: { "src/a.ts": { mutants: [null] } } }),
      "src/a.ts has a mutant whose status is undefined, which Stryker does not report.",
    ],
  ])("refuses %s", async (text, reason) => {
    const dir = project(SOURCES)
    writeFileSync(path.join(dir, "merged.json"), text)
    const result = await invoke(dir, ["run", "--json", "--report", "merged.json"])
    expect(result.json()).toMatchObject({
      state: "error",
      message: `merged.json is not a mutation report: ${reason}`,
    })
  })

  it("lists every missing and extra file, sorted, in its refusal", async () => {
    const dir = project({ ...SOURCES, "src/y.ts": "y\n", "src/z.ts": "z\n" })
    const report = reportFor(dir, { "src/z.ts": ["Killed"], "src/y.ts": ["Killed"] })
    writeFileSync(path.join(dir, "merged.json"), JSON.stringify(report))
    const result = await invoke(
      dir,
      ["run", "--json", "--report", "merged.json", "--mutate", "src/c.ts,src/a.ts"],
      undefined,
      { mutantFree: () => Promise.resolve([]) },
    )
    expect(result.json().message).toBe(
      "merged.json was not made from this checkout's plan: it lacks src/a.ts, src/c.ts; it has src/y.ts, src/z.ts, which this run does not mutate.",
    )
  })

  it("names every file whose source changed", async () => {
    const dir = project(SOURCES)
    writeFileSync(path.join(dir, "merged.json"), JSON.stringify(reportFor(dir, all)))
    writeFileSync(path.join(dir, "src/c.ts"), "changed\n")
    writeFileSync(path.join(dir, "src/a.ts"), "changed\n")
    const result = await invoke(dir, ["run", "--json", "--report", "merged.json"])
    expect(result.json().message).toBe(
      "merged.json was not made from this checkout: src/a.ts, src/c.ts differ from the text that was mutated.",
    )
  })

  it("counts a file it cannot read as changed", async () => {
    const dir = project(SOURCES)
    const report = reportFor(dir, { "src/a.ts": ["Killed"] })
    writeFileSync(
      path.join(dir, "merged.json"),
      JSON.stringify({ files: { "src/gone.ts": report.files["src/a.ts"] } }),
    )
    const result = await invoke(dir, [
      "run",
      "--json",
      "--report",
      "merged.json",
      "--mutate",
      "src/gone.ts",
    ])
    expect(result.json().message).toBe(
      "merged.json was not made from this checkout: src/gone.ts differs from the text that was mutated.",
    )
  })

  it("refuses a report when it cannot tell which files hold a mutant", async () => {
    const dir = project(SOURCES)
    const report = reportFor(dir, { "src/a.ts": ["Killed"] })
    writeFileSync(path.join(dir, "merged.json"), JSON.stringify(report))
    const result = await invoke(dir, ["run", "--json", "--report", "merged.json"], undefined, {
      mutantFree: () => Promise.reject(new Error("no instrumenter")),
    })
    expect(result.json().message).toBe(
      "merged.json lacks src/b.ts, src/c.ts, and whether Stryker would mutate them could not be told: no instrumenter",
    )
  })

  describe("with Stryker's own instrumenter", () => {
    // The project borrows this repository's node_modules, where the instrumenter is installed.
    const withInstrumenter = (files: Record<string, string>) => {
      const dir = project(files)
      symlinkSync(path.join(repository, "node_modules"), path.join(dir, "node_modules"))
      return dir
    }
    const TS = {
      "src/a.ts": "export const a = (x: number) => x + 1\n",
      "src/b.ts": "export const b = (x: number) => x > 2\n",
      "src/barrel.ts": 'export { a } from "./a.js"\n',
    }

    it("adopts a report that lacks only a file with no mutant in it", async () => {
      const dir = withInstrumenter(TS)
      const report = reportFor(dir, { "src/a.ts": ["Killed"], "src/b.ts": ["Killed"] })
      writeFileSync(path.join(dir, "merged.json"), JSON.stringify(report))
      const result = await invoke(dir, ["run", "--json", "--report", "merged.json"])
      expect(result.json()).toMatchObject({ state: "adopted" })
    }, 30_000)

    it("refuses a report that lacks a file with mutants, and names only that one", async () => {
      const dir = withInstrumenter(TS)
      const report = reportFor(dir, { "src/a.ts": ["Killed"] })
      writeFileSync(path.join(dir, "merged.json"), JSON.stringify(report))
      const result = await invoke(dir, ["run", "--json", "--report", "merged.json"])
      expect(result.json().message).toBe(
        "merged.json was not made from this checkout's plan: it lacks src/b.ts.",
      )
    }, 30_000)

    it("refuses a report when the instrumenter cannot be found", async () => {
      const dir = project(TS)
      const report = reportFor(dir, { "src/a.ts": ["Killed"] })
      writeFileSync(path.join(dir, "merged.json"), JSON.stringify(report))
      const result = await invoke(dir, ["run", "--json", "--report", "merged.json"])
      expect(result.json().message).toMatch(
        /^merged\.json lacks src\/b\.ts, src\/barrel\.ts, and whether Stryker would mutate them could not be told: /,
      )
    }, 30_000)
  })
})

describe("repo-contract mutation run: timeouts, more cases", () => {
  const timeout = (line: number) => ({
    status: "Timeout",
    mutatorName: "M",
    replacement: "r",
    location: at(line),
  })

  it("re-runs timeouts up to and including the limit", async () => {
    const dir = project(SOURCES)
    const behaviour: Behaviour = (args, cwd) => {
      if (mutateArg({ args, quiet: false }) !== undefined) return 1
      return writes(dir, reportFor(dir, { "src/c.ts": ["Timeout", "Timeout"] }))(args, cwd)
    }
    const result = await invoke(dir, ["run", "--json", "--confirm-timeouts", "2"], behaviour)
    expect(result.json()).toMatchObject({ timeouts: { rerun: 2, caught: 0 } })
  })

  it("leaves an unreadable report and a report without timeouts byte-identical", async () => {
    for (const text of ["{", '{ "files": { "src/a.ts": { "mutants": [] } } }']) {
      const dir = project(SOURCES)
      const result = await invoke(dir, ["run", "--json", "--cache", "read-write"], () => {
        mkdirSync(path.join(dir, "reports/mutation"), { recursive: true })
        writeFileSync(path.join(dir, REPORT), text)
        return 0
      })
      expect(result.json()).toMatchObject({ state: "ran", timeouts: { rerun: 0, caught: 0 } })
      expect(readFileSync(path.join(dir, REPORT), "utf8")).toBe(text)
      const again = await invoke(dir, ["run", "--json", "--cache", "read-write"], () => 0)
      expect(again.json()).not.toMatchObject({ state: "reused" })
    }
  })

  it("skips entries without mutants, null mutants and timeouts without a location", async () => {
    const dir = project(SOURCES)
    const report = {
      files: {
        "src/a.ts": null,
        "src/b.ts": {},
        "src/c.ts": {
          mutants: [
            null,
            { status: "Timeout", mutatorName: "M", replacement: "r" },
            { status: "Timeout", mutatorName: "M", replacement: "r", location: {} },
            timeout(3),
          ],
        },
      },
    }
    const result = await invoke(dir, ["run", "--json", "--cache", "read-write"], (args, cwd) => {
      if (mutateArg({ args, quiet: false }) !== undefined) return 1
      return writes(dir, report)(args, cwd)
    })
    expect(result.calls.map(mutateArg)).toEqual([undefined, "src/c.ts:3-3"])
    expect(result.json()).toMatchObject({ state: "ran", timeouts: { rerun: 1, caught: 0 } })
  })

  it("keeps a timeout whose re-run report lacks it", async () => {
    const dir = project(SOURCES)
    const reruns = [{}, { files: {} }, { files: { "src/c.ts": {} } }]
    const behaviour: Behaviour = (args, cwd) => {
      if (mutateArg({ args, quiet: false }) === undefined) {
        return writes(dir, { files: { "src/c.ts": { mutants: [1, 2, 3].map(timeout) } } })(
          args,
          cwd,
        )
      }
      return writes(dir, reruns.shift())(args, cwd)
    }
    const result = await invoke(dir, ["run", "--json"], behaviour)
    expect(result.json()).toMatchObject({ timeouts: { rerun: 3, caught: 0 } })
  })

  it("credits a re-run only to the mutant it re-ran", async () => {
    const dir = project(SOURCES)
    const wanted = {
      ...timeout(2),
      location: { start: { line: 2, column: 5 }, end: { line: 2, column: 6 } },
    }
    const decoys = [
      null,
      { ...wanted, location: undefined },
      { ...wanted, location: {} },
      { ...wanted, mutatorName: "Other" },
      { ...wanted, replacement: "other" },
      { ...wanted, location: { start: { line: 3, column: 5 }, end: wanted.location.end } },
      { ...wanted, location: { start: { line: 2, column: 6 }, end: wanted.location.end } },
    ].map((decoy) => (decoy === null ? null : { ...decoy, status: "Survived" }))
    const behaviour: Behaviour = (args, cwd) => {
      if (mutateArg({ args, quiet: false }) === undefined) {
        return writes(dir, { files: { "src/c.ts": { mutants: [wanted] } } })(args, cwd)
      }
      return writes(dir, {
        files: { "src/c.ts": { mutants: [...decoys, { ...wanted, status: "Killed" }] } },
      })(args, cwd)
    }
    await invoke(dir, ["run", "--json"], behaviour)
    const report = JSON.parse(readFileSync(path.join(dir, REPORT), "utf8")) as StrykerReport
    expect(report.files["src/c.ts"]?.mutants[0]).toMatchObject({
      status: "Killed",
      statusReason: CAUGHT_ALONE,
    })
  })
})

describe("repo-contract mutation run: the cache key", () => {
  interface KeyInput {
    inputs: Record<string, string>
    tools: Record<string, string>
  }
  const recording = () => {
    const keys: KeyInput[] = []
    const stored: { durationMs: number }[] = []
    const engine = {
      ...affected,
      cacheKey: (input: KeyInput & { check: string }) => {
        keys.push(input)
        return affected.cacheKey(input)
      },
      createCache: (options: Parameters<typeof affected.createCache>[0]) => {
        const cache = affected.createCache(options)
        return {
          ...cache,
          store: (entry: Parameters<typeof cache.store>[0]) => {
            stored.push(entry)
            return cache.store(entry)
          },
        }
      },
    }
    return { keys, stored, engine }
  }

  it("asks git for every tracked and untracked file that is not ignored", async () => {
    const dir = project(SOURCES)
    const asked: unknown[][] = []
    await invoke(
      dir,
      ["run", "--json", "--cache", "read-write"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      {
        git: (args: string[], at: string) => {
          asked.push([args, at])
          return Promise.resolve(listing(dir))
        },
      },
    )
    expect(asked).toEqual([[["ls-files", "-co", "--exclude-standard", "-z"], dir]])
  })

  it("runs without the cache when git fails", async () => {
    const dir = project(SOURCES)
    const result = await invoke(
      dir,
      ["run", "--json", "--cache", "read-write"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      { git: () => Promise.reject(new Error("not a git repository")) },
    )
    expect(result.json()).toMatchObject({ state: "ran", inputs: null })
    expect(result.stderr).toContain("the cache is off for this run")
  })

  it("keys on the listed sources, the config, the restriction and Node.js, never on output", async () => {
    const dir = project({
      ...SOURCES,
      "coverage/c.json": "{}",
      "node_modules/m/index.js": "m",
      "reports/r.json": "{}",
    })
    const { keys, engine } = recording()
    const listed = [
      "src/a.ts",
      "coverage/c.json",
      "node_modules/m/index.js",
      "reports/r.json",
      "src/deleted.ts",
      "",
    ].join("\0")
    await invoke(
      dir,
      ["run", "--json", "--cache", "read-write"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      {
        affected: engine,
        git: () => Promise.resolve(listed),
      },
    )
    expect(keys).toHaveLength(1)
    expect(keys[0]!.inputs).toEqual({
      "src/a.ts": sha256(SOURCES["src/a.ts"]),
      "(stryker config)": sha256(JSON.stringify(CONFIG)),
      "(restriction)": sha256("\0"),
    })
    expect(keys[0]!.tools).toEqual({ node: process.version })
  })

  it("keys a --mutate run on its file list", async () => {
    const dir = project(SOURCES)
    const { keys, engine } = recording()
    await invoke(
      dir,
      ["run", "--json", "--cache", "read-only", "--mutate", "src/a.ts"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      { affected: engine },
    )
    expect(keys[0]!.inputs["(restriction)"]).toBe(sha256("\0src/a.ts"))
  })

  it("never counts a report written at the project's top level as an input", async () => {
    const dir = project(SOURCES, { ...CONFIG, jsonReporter: { fileName: "mutation.json" } })
    const clean = (_args: readonly string[], cwd: string) => {
      writeFileSync(
        path.join(cwd, "mutation.json"),
        JSON.stringify(reportFor(dir, { "src/a.ts": ["Killed"] })),
      )
      return 0
    }
    await invoke(dir, ["run", "--json", "--cache", "read-write"], clean)
    const again = await invoke(dir, ["run", "--json", "--cache", "read-write"], clean)
    expect(again.json()).toMatchObject({ state: "reused" })
  })

  it("stores how long the run took", async () => {
    const dir = project(SOURCES)
    const { stored, engine } = recording()
    await invoke(
      dir,
      ["run", "--json", "--cache", "read-write"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
      {
        affected: engine,
      },
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]!.durationMs).toBeGreaterThanOrEqual(0)
    expect(stored[0]!.durationMs).toBeLessThan(60_000)
  })

  it.each([
    [
      "one survivor among kills",
      { files: { "src/a.ts": { mutants: [{ status: "Killed" }, { status: "Survived" }] } } },
    ],
    ["no mutant at all", { files: {} }],
    ["a null mutant", { files: { "src/a.ts": { mutants: [null, { status: "Killed" }] } } }],
  ])("never keeps a clean exit whose report has %s", async (_name, report) => {
    const dir = project(SOURCES)
    const behaviour = writes(dir, report)
    await invoke(
      dir,
      ["run", "--json", "--cache", "read-write", "--confirm-timeouts", "0"],
      behaviour,
    )
    const again = await invoke(dir, ["run", "--json", "--cache", "read-write"], behaviour)
    expect(again.json()).toMatchObject({ state: "ran" })
  })

  it("keeps a clean run whose report has a file without mutants", async () => {
    const dir = project(SOURCES)
    const report = {
      files: { "src/a.ts": null, "src/b.ts": {}, "src/c.ts": { mutants: [{ status: "Killed" }] } },
    }
    await invoke(dir, ["run", "--json", "--cache", "read-write"], writes(dir, report))
    const again = await invoke(dir, ["run", "--json", "--cache", "read-write"])
    expect(again.json()).toMatchObject({ state: "reused" })
  })
})

describe("repo-contract mutation run: a failure ends in a report", () => {
  const errorReport = (message: string) => ({
    schemaVersion: 1,
    state: "error",
    report: "",
    exitCode: null,
    shard: null,
    mutate: null,
    timeouts: { rerun: 0, caught: 0 },
    inputs: null,
    message,
  })

  it("recreates the report's directory when a cache hit follows a removed reports/", async () => {
    const dir = project(SOURCES)
    const clean = reportFor(dir, { "src/a.ts": ["Killed"] })
    await invoke(dir, ["run", "--json", "--cache", "read-write"], writes(dir, clean))
    rmSync(path.join(dir, "reports"), { recursive: true, force: true })

    const again = await invoke(dir, ["run", "--json", "--cache", "read-write"])
    expect(again.calls).toEqual([])
    expect(again.code).toBe(0)
    expect(again.json()).toMatchObject({ state: "reused", report: REPORT })
    expect(JSON.parse(readFileSync(path.join(dir, REPORT), "utf8"))).toEqual(clean)
  })

  it.each([
    ["an Error", new Error("disk full"), "disk full"],
    ["a value that is not an Error", "EIO", "EIO"],
  ])("turns %s thrown while Stryker runs into an error report", async (_, thrown, shown) => {
    const dir = project(SOURCES)
    const reason: unknown = thrown
    const result = await invoke(dir, ["run", "--json"], () => 0, {
      stryker: () => {
        throw reason
      },
    })
    expect(result.code).toBe(1)
    expect(result.json()).toEqual(
      errorReport(`The mutation run stopped: ${shown}. No report was judged.`),
    )
  })

  it("turns a cache store that cannot be opened into an error report", async () => {
    const dir = project(SOURCES)
    const result = await invoke(dir, ["run", "--json", "--cache", "read-write"], () => 0, {
      helpers: {
        ...helpers,
        createFileCacheStore: () => {
          throw new Error("read-only file system")
        },
      },
    })
    expect(result.calls).toEqual([])
    expect(result.code).toBe(1)
    expect(result.json()).toEqual(
      errorReport("The mutation run stopped: read-only file system. No report was judged."),
    )
  })

  it("prints the failure alone without --json", async () => {
    const dir = project(SOURCES)
    const result = await invoke(dir, ["run"], () => 0, {
      stryker: () => Promise.reject(new Error("disk full")),
    })
    expect(result.code).toBe(1)
    expect(result.stdout).toBe("The mutation run stopped: disk full. No report was judged.\n")
  })

  it("names the runner file it cannot read, and still runs", async () => {
    const runner = "node_modules/@stryker-mutator/vitest-runner"
    const dir = project({
      ...SOURCES,
      "node_modules/vitest/package.json": JSON.stringify({ version: "5.1.0" }),
      [`${runner}/package.json`]: "{}",
      [`${runner}/dist/src/stryker-setup.js`]: "something else\n",
    })
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.json()).toMatchObject({ state: "ran", exitCode: 0 })
    expect(result.stderr).toBe(
      `[mutation] cannot read ${path.join(dir, runner, "dist", "src", "test-helpers.js")}, so @stryker-mutator/vitest-runner was left as installed. If every mutant survives having run 0 tests, reinstall it and see stryker-js#6210.\n`,
    )
  })

  it("names a Vitest package.json it cannot parse, and still runs", async () => {
    const runner = "node_modules/@stryker-mutator/vitest-runner"
    const dir = project({
      ...SOURCES,
      "node_modules/vitest/package.json": '{"version":"5.',
      [`${runner}/package.json`]: "{}",
    })
    const result = await invoke(
      dir,
      ["run", "--json"],
      writes(dir, reportFor(dir, { "src/a.ts": ["Killed"] })),
    )
    expect(result.json()).toMatchObject({ state: "ran", exitCode: 0 })
    expect(result.stderr).toBe(
      `[mutation] cannot read ${path.join(dir, "node_modules", "vitest", "package.json")}, so @stryker-mutator/vitest-runner was left as installed. If every mutant survives having run 0 tests, reinstall it and see stryker-js#6210.\n`,
    )
  })
})
