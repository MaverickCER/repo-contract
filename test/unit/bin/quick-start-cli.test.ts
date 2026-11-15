import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  BEGIN_MARKER,
  END_MARKER,
  extractQuickStart,
  installTarball,
  parseQuickStartArgs,
  QUICK_START_USAGE,
  runQuickStart,
} from "../../../bin/quick-start-cli.mjs"

const block = (body: string, fence = "sh"): string =>
  `# Title\n\n${BEGIN_MARKER}\n\n\`\`\`${fence}\n${body}\n\`\`\`\n\n${END_MARKER}\n\nMore.\n`

describe("extractQuickStart()", () => {
  it("finds no block in a README without markers", () => {
    expect(extractQuickStart("# Title\n\n```sh\nnpm test\n```\n")).toEqual({ kind: "none" })
  })

  it("reads one command per line, leaving out comments and blank lines", () => {
    expect(
      extractQuickStart(block("npm install x\n\n# a comment\n  npx x init  # inline\n")),
    ).toEqual({ kind: "found", commands: ["npm install x", "npx x init  # inline"] })
  })

  it("joins lines continued with a backslash, and reads CRLF line endings", () => {
    const markdown = block("npm install \\\n  --save-dev x\nnpx x \\").replace(/\n/g, "\r\n")
    expect(extractQuickStart(markdown)).toEqual({
      kind: "found",
      commands: ["npm install --save-dev x", "npx x"],
    })
  })

  it.each(["sh", "shell", "bash"])("accepts a block marked %s", (fence) => {
    expect(extractQuickStart(block("npm test", fence)).kind).toBe("found")
  })

  it.each([
    [
      `${BEGIN_MARKER}\n\`\`\`sh\nnpm test\n\`\`\`\n`,
      `expected one ${BEGIN_MARKER} followed by one ${END_MARKER}; found 1 and 0.`,
    ],
    [
      `${END_MARKER}\n\`\`\`sh\nnpm test\n\`\`\`\n${BEGIN_MARKER}\n`,
      `expected one ${BEGIN_MARKER} followed by one ${END_MARKER}; found 1 and 1.`,
    ],
    [
      `${block("a")}${block("b")}`,
      `expected one ${BEGIN_MARKER} followed by one ${END_MARKER}; found 2 and 2.`,
    ],
    [
      `${BEGIN_MARKER}\nnpm test\n${END_MARKER}\n`,
      "the markers must hold one fenced code block and nothing else.",
    ],
    [
      `${BEGIN_MARKER}\n\`\`\`sh\n${END_MARKER}\n`,
      "the markers must hold one fenced code block and nothing else.",
    ],
    [
      `${BEGIN_MARKER}\n${END_MARKER}\n`,
      "the markers must hold one fenced code block and nothing else.",
    ],
    [
      `${BEGIN_MARKER}\n\`\`\`sh\nnpm test\n\`\`\`\nprose\n${END_MARKER}\n`,
      "the markers must hold one fenced code block and nothing else.",
    ],
    [
      block("npm test", "ts"),
      'the fenced block must be marked sh, shell or bash; it is marked "ts".',
    ],
    [block("npm test", ""), 'the fenced block must be marked sh, shell or bash; it is marked "".'],
    [block("# only a comment"), "the fenced block has no commands."],
  ])("rejects a malformed block: %j", (markdown, reason) => {
    expect(extractQuickStart(markdown)).toEqual({ kind: "invalid", reason })
  })
})

describe("installTarball()", () => {
  const tarball = "../tarball/x-1.0.0.tgz"

  it("points each install of the package at the tarball, with any version spec", () => {
    expect(
      installTarball(
        [
          "npm install --save-dev x tsx",
          "npm i x@^1",
          "pnpm add -D x",
          "yarn add x@latest",
          "bun add x",
          "npx x init",
        ],
        "x",
        tarball,
      ),
    ).toEqual({
      commands: [
        `npm install --save-dev ${tarball} tsx`,
        `npm i ${tarball}`,
        `pnpm add -D ${tarball}`,
        `yarn add ${tarball}`,
        `bun add ${tarball}`,
        "npx x init",
      ],
      installs: 5,
    })
  })

  it("matches a scoped name exactly, and leaves look-alikes and other commands alone", () => {
    expect(
      installTarball(
        [
          "npm install @scope/x@2",
          "npm install x-extra @scope/xy",
          "npm run x",
          "npm x install x",
          "yarn install x",
          "cargo install x",
        ],
        "@scope/x",
        tarball,
      ),
    ).toEqual({
      commands: [
        `npm install ${tarball}`,
        "npm install x-extra @scope/xy",
        "npm run x",
        "npm x install x",
        "yarn install x",
        "cargo install x",
      ],
      installs: 1,
    })
  })

  it("counts no install when no command names the package", () => {
    expect(installTarball(["npm install other"], "x", tarball)).toEqual({
      commands: ["npm install other"],
      installs: 0,
    })
  })
})

describe("parseQuickStartArgs()", () => {
  it("defaults to README.md, five minutes and text output", () => {
    expect(parseQuickStartArgs([])).toEqual({
      kind: "run",
      options: { readme: "README.md", timeoutMs: 300_000, json: false },
    })
  })

  it("reads every option in both spellings", () => {
    expect(
      parseQuickStartArgs(["--readme", "docs/A.md", "--timeout=5000", "--json", "-C", "pkg"]),
    ).toEqual({
      kind: "run",
      options: { readme: "docs/A.md", timeoutMs: 5000, json: true, cwd: "pkg" },
    })
    expect(parseQuickStartArgs(["--readme=B.md", "--timeout", "1"])).toEqual({
      kind: "run",
      options: { readme: "B.md", timeoutMs: 1, json: false },
    })
  })

  it.each([
    [["--help"], { kind: "help" }],
    [["-h", "--bogus"], { kind: "help" }],
    [["-V"], { kind: "version" }],
    [["--version"], { kind: "version" }],
    [["--bogus"], { kind: "error", message: "unknown option '--bogus'" }],
    [["stray"], { kind: "error", message: "unexpected argument 'stray'" }],
    [["--json=yes"], { kind: "error", message: "option '--json' does not take a value" }],
    [["--readme"], { kind: "error", message: "option '--readme' needs a value" }],
    [["--readme="], { kind: "error", message: "option '--readme' needs a value" }],
    [["-C", "--json"], { kind: "error", message: "option '-C' needs a value" }],
    [
      ["--timeout", "0"],
      { kind: "error", message: "option '--timeout' needs a whole number of milliseconds" },
    ],
    [
      ["--timeout", "1.5"],
      { kind: "error", message: "option '--timeout' needs a whole number of milliseconds" },
    ],
    [
      ["--timeout", "10s"],
      { kind: "error", message: "option '--timeout' needs a whole number of milliseconds" },
    ],
  ])("parses %j", (argv, expected) => {
    expect(parseQuickStartArgs(argv)).toEqual(expected)
  })
})

interface ShellCall {
  readonly command: string
  readonly cwd: string
  readonly timeoutMs: number
}

const root = mkdtempSync(path.join(tmpdir(), "quick-start-cli-"))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A package directory with a README and a package.json. */
function packageDir(
  name: string,
  readme: string | undefined,
  packageJson = '{"name":"x"}',
): string {
  const dir = path.join(root, name)
  mkdirSync(dir)
  if (readme !== undefined) writeFileSync(path.join(dir, "README.md"), readme)
  writeFileSync(path.join(dir, "package.json"), packageJson)
  return dir
}

async function invoke(
  argv: string[],
  dir: string,
  options: {
    readonly pack?: { exitCode: number; stdout: string; stderr: string }
    readonly results?: Readonly<
      Record<string, { exitCode: number | null; timedOut: boolean; output: string }>
    >
    readonly tick?: number
  } = {},
) {
  const out: string[] = []
  const err: string[] = []
  const shellCalls: ShellCall[] = []
  const execCalls: { command: string; args: readonly string[]; cwd: string }[] = []
  const projectFiles: string[] = []
  let clock = 1000
  const code = await runQuickStart({
    argv,
    cwd: dir,
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    exec: async (command: string, args: readonly string[], { cwd }: { cwd: string }) => {
      execCalls.push({ command, args, cwd })
      return options.pack ?? { exitCode: 0, stdout: "npm notice\nx-1.0.0.tgz\n", stderr: "" }
    },
    shell: async (command: string, { cwd, timeoutMs }: { cwd: string; timeoutMs: number }) => {
      shellCalls.push({ command, cwd, timeoutMs })
      projectFiles.push(readFileSync(path.join(cwd, "package.json"), "utf8"))
      clock += options.tick ?? 10
      return options.results?.[command] ?? { exitCode: 0, timedOut: false, output: "fine\n" }
    },
    now: () => clock,
  })
  return { code, out: out.join(""), err: err.join(""), shellCalls, execCalls, projectFiles }
}

describe("runQuickStart()", () => {
  const passing = block("npm install --save-dev x tsx\nnpx x init\nnpm run contract")

  it("packs the package, installs the tarball in an empty project and runs every command in order", async () => {
    const dir = packageDir("passing", passing)
    const run = await invoke(["--json"], dir)
    expect(run.code).toBe(0)
    expect(run.execCalls).toHaveLength(1)
    expect(run.execCalls[0]?.command).toBe("npm")
    expect(run.execCalls[0]?.cwd).toBe(dir)
    expect(run.execCalls[0]?.args.slice(0, 3)).toEqual([
      "pack",
      "--ignore-scripts",
      "--pack-destination",
    ])
    const packDir = run.execCalls[0]?.args[3] ?? ""
    const project = run.shellCalls[0]?.cwd ?? ""
    expect(path.basename(packDir)).toBe("tarball")
    expect(project).toBe(path.join(path.dirname(packDir), "project"))
    expect(run.shellCalls.map((call) => call.command)).toEqual([
      "npm install --save-dev ../tarball/x-1.0.0.tgz tsx",
      "npx x init",
      "npm run contract",
    ])
    expect(run.shellCalls.every((call) => call.cwd === project)).toBe(true)
    expect(JSON.parse(run.projectFiles[0] ?? "")).toEqual({ name: "quick-start", version: "1.0.0" })
    expect(JSON.parse(run.out)).toEqual({
      schemaVersion: 1,
      readme: "README.md",
      state: "passed",
      commands: [
        {
          command: "npm install --save-dev ../tarball/x-1.0.0.tgz tsx",
          exitCode: 0,
          timedOut: false,
          durationMs: 10,
        },
        { command: "npx x init", exitCode: 0, timedOut: false, durationMs: 10 },
        { command: "npm run contract", exitCode: 0, timedOut: false, durationMs: 10 },
      ],
    })
    expect(existsSync(path.dirname(packDir))).toBe(false)
  })

  it("gives each command what is left of one time budget", async () => {
    const dir = packageDir("budget", passing)
    const run = await invoke(["--timeout", "100", "--json"], dir, { tick: 30 })
    expect(run.shellCalls.map((call) => call.timeoutMs)).toEqual([100, 70, 40])
    expect(run.code).toBe(0)
  })

  it("stops at the first failing command and reports its output", async () => {
    const dir = packageDir("failing", passing)
    const run = await invoke(["--json"], dir, {
      results: {
        "npx x init": { exitCode: 2, timedOut: false, output: `${"line\n".repeat(30)}boom\n` },
      },
    })
    expect(run.code).toBe(1)
    expect(run.shellCalls).toHaveLength(2)
    const report = JSON.parse(run.out) as { state: string; output: string; commands: unknown[] }
    expect(report.state).toBe("failed")
    expect(report.commands).toHaveLength(2)
    expect(report.output.split("\n")).toHaveLength(20)
    expect(report.output.endsWith("line\nboom")).toBe(true)
  })

  it("fails a command that times out, and runs none once the budget is spent", async () => {
    const dir = packageDir("timeout", passing)
    const timedOut = await invoke(["--json"], dir, {
      results: { "npx x init": { exitCode: null, timedOut: true, output: "" } },
    })
    expect(timedOut.code).toBe(1)
    expect(JSON.parse(timedOut.out)).toMatchObject({
      state: "failed",
      commands: [{ exitCode: 0 }, { command: "npx x init", exitCode: null, timedOut: true }],
    })
    const spent = await invoke(["--timeout", "10", "--json"], dir, { tick: 10 })
    expect(spent.shellCalls).toHaveLength(1)
    expect(JSON.parse(spent.out)).toMatchObject({
      state: "failed",
      commands: [
        { exitCode: 0 },
        { command: "npx x init", exitCode: null, timedOut: true, durationMs: 0 },
      ],
    })
  })

  it("names a README without a marked block, and runs nothing", async () => {
    const dir = packageDir("unmarked", "# x\n\n```sh\nnpm install x\n```\n")
    const run = await invoke(["--json"], dir)
    expect(run.code).toBe(1)
    expect(run.execCalls).toEqual([])
    expect(JSON.parse(run.out)).toEqual({
      schemaVersion: 1,
      readme: "README.md",
      state: "no-block",
      message: `README.md has no marked quick start. Put ${BEGIN_MARKER} on the line before its fenced shell block and ${END_MARKER} on the line after it.`,
    })
  })

  it("reports a malformed block, a quick start that never installs the package, and a failed pack", async () => {
    const invalid = await invoke(["--json"], packageDir("invalid", block("npm test", "ts")))
    expect(JSON.parse(invalid.out)).toMatchObject({
      state: "invalid",
      message:
        'README.md\'s quick start: the fenced block must be marked sh, shell or bash; it is marked "ts".',
    })
    const noInstall = await invoke(["--json"], packageDir("no-install", block("npm install other")))
    expect(noInstall.code).toBe(1)
    expect(noInstall.shellCalls).toEqual([])
    expect(JSON.parse(noInstall.out)).toMatchObject({
      state: "no-install",
      message:
        "no command installs x with npm, pnpm, yarn or bun, so the quick start would not run the packed tarball.",
    })
    const packFailed = await invoke(["--json"], packageDir("pack-failed", passing), {
      pack: { exitCode: 1, stdout: "", stderr: "npm error nope\n" },
    })
    expect(JSON.parse(packFailed.out)).toMatchObject({
      state: "error",
      message: "npm pack failed:\nnpm error nope",
    })
    const noTarball = await invoke(["--json"], packageDir("no-tarball", passing), {
      pack: { exitCode: 0, stdout: "something else\n", stderr: "" },
    })
    expect(JSON.parse(noTarball.out)).toMatchObject({ state: "error" })
    expect(noTarball.shellCalls).toEqual([])
  })

  it("reports a missing README, an unreadable package.json and a package without a name", async () => {
    const missing = await invoke(
      ["--json", "--readme", "NOPE.md"],
      packageDir("missing", undefined),
    )
    expect(missing.code).toBe(1)
    expect(JSON.parse(missing.out)).toMatchObject({ readme: "NOPE.md", state: "error" })
    expect((JSON.parse(missing.out) as { message: string }).message).toContain("NOPE.md")
    const broken = await invoke(["--json"], packageDir("broken", passing, "{"))
    expect(JSON.parse(broken.out)).toMatchObject({ state: "error" })
    const nameless = await invoke(["--json"], packageDir("nameless", passing, "{}"))
    expect(JSON.parse(nameless.out)).toEqual({
      schemaVersion: 1,
      readme: "README.md",
      state: "error",
      message: "package.json has no name to install.",
    })
  })

  it("reads the README and package.json from -C, relative to the working directory", async () => {
    const dir = packageDir("nested-parent", undefined)
    const nested = path.join(dir, "pkg")
    mkdirSync(nested)
    writeFileSync(path.join(nested, "README.md"), passing)
    writeFileSync(path.join(nested, "package.json"), '{"name":"x"}')
    const run = await invoke(["-C", "pkg", "--json"], dir)
    expect(run.code).toBe(0)
    expect(run.execCalls[0]?.cwd).toBe(nested)
  })

  it("prints a summary a person can read without --json", async () => {
    const dir = packageDir("human", passing)
    const passed = await invoke([], dir)
    expect(passed.out).toBe(
      [
        "ok    npm install --save-dev ../tarball/x-1.0.0.tgz tsx",
        "ok    npx x init",
        "ok    npm run contract",
        "",
        "The quick start passed against the packed tarball.",
        "",
      ].join("\n"),
    )
    const failed = await invoke(["--timeout", "500"], dir, {
      results: { "npx x init": { exitCode: null, timedOut: true, output: "slow\n" } },
    })
    expect(failed.out).toBe(
      [
        "ok    npm install --save-dev ../tarball/x-1.0.0.tgz tsx",
        "FAIL  npx x init (stopped after the 500 ms budget)",
        "",
        "slow",
        "",
      ].join("\n"),
    )
    const unmarked = await invoke([], packageDir("human-unmarked", "# x\n"))
    expect(unmarked.out).toContain("README.md has no marked quick start.")
  })

  it("prints help and the version, and reports a usage error with exit 2", async () => {
    const dir = packageDir("usage", passing)
    expect(await invoke(["--help"], dir)).toMatchObject({ code: 0, out: `${QUICK_START_USAGE}\n` })
    expect(await invoke(["-V"], dir)).toMatchObject({ code: 0, out: "9.9.9\n" })
    expect(await invoke(["--nope"], dir)).toMatchObject({
      code: 2,
      out: "",
      err: "repo-contract quick-start: unknown option '--nope'\nTry 'repo-contract quick-start --help' for more information.\n",
    })
  })
})
