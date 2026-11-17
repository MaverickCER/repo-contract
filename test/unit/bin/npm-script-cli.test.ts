import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  MAX_OUTPUT_CHARS,
  NPM_SCRIPT_USAGE,
  outputTail,
  parseNpmScriptArgs,
  runNpmScript,
  stopProcessGroup,
} from "../../../bin/npm-script-cli.mjs"

const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/**
 * @param scripts - package.json's `scripts`.
 * @returns a fresh project directory.
 */
function project(scripts: Record<string, string> = { build: "tsc" }): string {
  const dir = mkdtempSync(path.join(tmpdir(), "repo-contract-npm-script-"))
  roots.push(dir)
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts }))
  return dir
}

interface ExecCall {
  readonly command: string
  readonly args: readonly string[]
  readonly options: { readonly cwd: string; readonly timeoutMs?: number }
}

interface ExecResult {
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
}

/**
 * @param argv - the arguments after `npm-script`.
 * @param options - the directory and a fake npm.
 * @param options.cwd - the working directory.
 * @param options.exec - stands in for npm; it may change files to simulate a script.
 * @returns the exit status, the printed text and the calls made to `exec`.
 */
async function run(
  argv: readonly string[],
  options: { cwd: string; exec?: (call: ExecCall) => ExecResult | Promise<ExecResult> },
): Promise<{ status: number; stdout: string; stderr: string; calls: ExecCall[] }> {
  let stdout = ""
  let stderr = ""
  const calls: ExecCall[] = []
  const status = await runNpmScript({
    argv,
    cwd: options.cwd,
    version: "9.9.9",
    stdout: (text: string) => (stdout += text),
    stderr: (text: string) => (stderr += text),
    exec: async (command: string, args: readonly string[], execOptions: ExecCall["options"]) => {
      const call = { command, args, options: execOptions }
      calls.push(call)
      return options.exec === undefined
        ? { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
        : options.exec(call)
    },
  })
  return { status, stdout, stderr, calls }
}

const json = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

describe("parseNpmScriptArgs()", () => {
  it("reads the script, every --must-not-change, --timeout, --json and -C", () => {
    expect(
      parseNpmScriptArgs([
        "build",
        "--must-not-change",
        "docs",
        "--must-not-change=README.md",
        "--timeout=5000",
        "--json",
        "-C",
        "pkg",
      ]),
    ).toEqual({
      kind: "run",
      options: {
        script: "build",
        mustNotChange: ["docs", "README.md"],
        timeoutMs: 5000,
        json: true,
        cwd: "pkg",
      },
    })
  })

  it("defaults to no watched paths, no time limit and text output", () => {
    expect(parseNpmScriptArgs(["test"])).toStrictEqual({
      kind: "run",
      options: { script: "test", mustNotChange: [], json: false },
    })
  })

  it.each([
    [["--help"], { kind: "help" }],
    [["build", "-h"], { kind: "help" }],
    [["--version"], { kind: "version" }],
    [["-V"], { kind: "version" }],
  ])("recognises %j", (argv, expected) => {
    expect(parseNpmScriptArgs(argv)).toEqual(expected)
  })

  it.each([
    [[], "missing the npm script to run"],
    [["--json"], "missing the npm script to run"],
    [["a", "b"], "unexpected argument 'b'"],
    [["build", "--nope"], "unknown option '--nope'"],
    [["build", "--json=yes"], "option '--json' does not take a value"],
    [["build", "--must-not-change"], "option '--must-not-change' needs a value"],
    [["build", "--must-not-change", "--json"], "option '--must-not-change' needs a value"],
    [["build", "--timeout", "0"], "option '--timeout' needs a whole number of milliseconds"],
    [["build", "--timeout", "1.5"], "option '--timeout' needs a whole number of milliseconds"],
    [["build", "-C"], "option '-C' needs a value"],
    [["build", "-C=sub"], "unknown option '-C=sub'"],
    [["build", "--must-not-change="], "option '--must-not-change' needs a value"],
    [["build", "--timeout="], "option '--timeout' needs a value"],
    [["build", "--timeout=-5"], "option '--timeout' needs a value"],
  ])("rejects %j", (argv, message) => {
    expect(parseNpmScriptArgs(argv)).toEqual({ kind: "error", message })
  })
})

describe("R7b repo-contract npm-script", () => {
  it("prints a missing report when package.json has no such script", async () => {
    const result = await run(["lint", "--json"], { cwd: project({ build: "tsc" }) })
    expect(result.calls).toEqual([])
    expect(result.status).toBe(1)
    expect(json(result.stdout)).toEqual({
      schemaVersion: 1,
      script: "lint",
      state: "missing",
      exitCode: null,
      timedOut: false,
      changed: [],
      output: "",
    })
  })

  it("treats a package.json without scripts as missing the script", async () => {
    const dir = project()
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x" }))
    const result = await run(["build", "--json"], { cwd: dir })
    expect(json(result.stdout).state).toBe("missing")
  })

  it("runs npm run <script> and prints its exit code and output tail", async () => {
    const dir = project()
    const lines = Array.from({ length: 50 }, (_, index) => `line ${String(index + 1)}`)
    const result = await run(["build", "--json", "--timeout", "7000"], {
      cwd: dir,
      exec: () => ({
        exitCode: 0,
        timedOut: false,
        stdout: `${lines.join("\n")}\n`,
        stderr: "warning: slow\n",
      }),
    })
    expect(result.calls).toEqual([
      {
        command: "npm",
        args: ["--loglevel=silent", "run", "build"],
        options: { cwd: dir, timeoutMs: 7000 },
      },
    ])
    expect(result.status).toBe(0)
    const printed = json(result.stdout)
    expect(printed).toMatchObject({ state: "ran", exitCode: 0, timedOut: false, changed: [] })
    expect(printed.output).toBe([...lines.slice(-39), "warning: slow"].join("\n"))
  })

  it("exits 1 and reports a failing script's exit code", async () => {
    const result = await run(["build", "--json"], {
      cwd: project(),
      exec: () => ({ exitCode: 2, timedOut: false, stdout: "", stderr: "error TS1\n" }),
    })
    expect(result.status).toBe(1)
    expect(json(result.stdout)).toMatchObject({ exitCode: 2, output: "error TS1" })
  })

  it("reports a script stopped by its time limit", async () => {
    const result = await run(["build", "--json", "--timeout", "10"], {
      cwd: project(),
      exec: () => ({ exitCode: null, timedOut: true, stdout: "", stderr: "" }),
    })
    expect(result.status).toBe(1)
    expect(json(result.stdout)).toMatchObject({ exitCode: null, timedOut: true })
  })

  it("passes no time limit when --timeout is absent", async () => {
    const result = await run(["build", "--json"], { cwd: project() })
    expect(Object.keys(result.calls[0]?.options ?? {})).toEqual(["cwd"])
  })

  it("runs in the -C directory", async () => {
    const dir = project()
    mkdirSync(path.join(dir, "pkg"))
    writeFileSync(path.join(dir, "pkg", "package.json"), JSON.stringify({ scripts: { b: "x" } }))
    const result = await run(["b", "--json", "-C", "pkg"], { cwd: dir })
    expect(result.calls[0]?.options.cwd).toBe(path.join(dir, "pkg"))
  })

  it("hashes mustNotChange paths before and after and lists the changed ones", async () => {
    const dir = project()
    mkdirSync(path.join(dir, "docs", "api"), { recursive: true })
    writeFileSync(path.join(dir, "docs", "api", "a.md"), "a")
    writeFileSync(path.join(dir, "docs", "api", "gone.md"), "gone")
    writeFileSync(path.join(dir, "docs", "api", "same.md"), "same")
    writeFileSync(path.join(dir, "README.md"), "readme")
    writeFileSync(path.join(dir, "outside.md"), "outside")
    const result = await run(
      ["build", "--json", "--must-not-change", "docs", "--must-not-change", "README.md"],
      {
        cwd: dir,
        exec: () => {
          writeFileSync(path.join(dir, "docs", "api", "a.md"), "A")
          unlinkSync(path.join(dir, "docs", "api", "gone.md"))
          writeFileSync(path.join(dir, "docs", "api", "new.md"), "new")
          writeFileSync(path.join(dir, "outside.md"), "changed but not watched")
          return { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
        },
      },
    )
    expect(result.status).toBe(1)
    expect(json(result.stdout).changed).toEqual([
      "docs/api/a.md",
      "docs/api/gone.md",
      "docs/api/new.md",
    ])
  })

  it("sorts the changed paths, created and deleted alike", async () => {
    const dir = project()
    mkdirSync(path.join(dir, "out"))
    writeFileSync(path.join(dir, "out", "z.md"), "z")
    const result = await run(["build", "--json", "--must-not-change", "out"], {
      cwd: dir,
      exec: () => {
        unlinkSync(path.join(dir, "out", "z.md"))
        writeFileSync(path.join(dir, "out", "b.md"), "b")
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
      },
    })
    expect(json(result.stdout).changed).toEqual(["out/b.md", "out/z.md"])
  })

  it("treats a null scripts field as missing the script", async () => {
    const dir = project()
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts: null }))
    const result = await run(["build", "--json"], { cwd: dir })
    expect(result.status).toBe(1)
    expect(json(result.stdout)).toMatchObject({ state: "missing" })
    expect(result.calls).toEqual([])
  })

  it("lists a watched path the script created", async () => {
    const dir = project()
    const result = await run(["build", "--json", "--must-not-change", "dist/out.txt"], {
      cwd: dir,
      exec: () => {
        mkdirSync(path.join(dir, "dist"))
        writeFileSync(path.join(dir, "dist", "out.txt"), "x")
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
      },
    })
    expect(json(result.stdout).changed).toEqual(["dist/out.txt"])
  })

  it("passes when the watched paths are byte-identical afterwards", async () => {
    const dir = project()
    writeFileSync(path.join(dir, "schema.json"), "{}")
    const result = await run(["build", "--json", "--must-not-change", "schema.json"], {
      cwd: dir,
      exec: () => {
        writeFileSync(path.join(dir, "schema.json"), "{}")
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
      },
    })
    expect(result.status).toBe(0)
    expect(json(result.stdout).changed).toEqual([])
  })

  it("prints a summary for a person without --json", async () => {
    const dir = project()
    writeFileSync(path.join(dir, "schema.json"), "{}")
    const passed = await run(["build", "--must-not-change", "schema.json"], {
      cwd: dir,
      exec: () => ({ exitCode: 0, timedOut: false, stdout: "built\n", stderr: "" }),
    })
    expect(passed.stdout).toBe("built\n\nnpm run build exited 0 and changed no watched path.\n")
    const missing = await run(["lint"], { cwd: dir })
    expect(missing.stdout).toBe("package.json has no lint script.\n")
    const failed = await run(["build"], {
      cwd: dir,
      exec: () => ({ exitCode: 1, timedOut: false, stdout: "", stderr: "boom\n" }),
    })
    expect(failed.stdout).toBe("boom\n\nnpm run build exited 1.\n")
    const changed = await run(["build", "--must-not-change", "schema.json"], {
      cwd: dir,
      exec: () => {
        writeFileSync(path.join(dir, "schema.json"), "{ }")
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "" }
      },
    })
    expect(changed.stdout).toBe(
      "npm run build exited 0 and changed 1 watched file(s):\n- schema.json\n",
    )
    const timedOut = await run(["build", "--timeout", "5"], {
      cwd: dir,
      exec: () => ({ exitCode: null, timedOut: true, stdout: "", stderr: "" }),
    })
    expect(timedOut.stdout).toBe("npm run build was stopped after 5 ms.\n")
  })

  it("exits 1 with a message on stderr and nothing on stdout when package.json cannot be read", async () => {
    const dir = project()
    rmSync(path.join(dir, "package.json"))
    const result = await run(["build", "--json"], { cwd: dir })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toMatch(/^repo-contract npm-script: cannot read .*package\.json/)
    writeFileSync(path.join(dir, "package.json"), "{")
    const invalid = await run(["build", "--json"], { cwd: dir })
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toMatch(/^repo-contract npm-script: cannot read .*package\.json/)
  })

  it("rejects a missing script argument with exit 2", async () => {
    const result = await run(["--json"], { cwd: project() })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe(
      "repo-contract npm-script: missing the npm script to run\nTry 'repo-contract npm-script --help' for more information.\n",
    )
  })

  it("prints help and the version", async () => {
    const dir = project()
    expect(await run(["--help"], { cwd: dir })).toMatchObject({
      status: 0,
      stdout: `${NPM_SCRIPT_USAGE}\n`,
    })
    expect(await run(["--version"], { cwd: dir })).toMatchObject({ status: 0, stdout: "9.9.9\n" })
    expect(NPM_SCRIPT_USAGE).toContain("--must-not-change <path>")
  })
})

describe("outputTail()", () => {
  it("keeps output exactly at the limit whole", () => {
    const tail = outputTail(5)
    tail.push("ab\ncd")
    expect(tail.text()).toBe("ab\ncd")
  })

  it("keeps a cut line that ends in the only newline", () => {
    const tail = outputTail(3)
    tail.push("abcd\n")
    expect(tail.text()).toBe("cd\n")
  })

  it("keeps everything while the output fits", () => {
    const tail = outputTail(10)
    tail.push("a\n")
    tail.push("bc\n")
    expect(tail.text()).toBe("a\nbc\n")
  })

  it("holds at most the limit, dropping the line it cut through", () => {
    const tail = outputTail(10)
    tail.push("line1\nline2\nline3\n")
    expect(tail.text()).toBe("line3\n")
    for (let index = 0; index < 1000; index += 1) tail.push("n\n")
    expect(tail.text()).toBe("n\n".repeat(4))
  })

  it("keeps a cut line when it is the only line left", () => {
    const tail = outputTail(10)
    tail.push("x".repeat(25))
    expect(tail.text()).toBe("x".repeat(10))
    tail.push("\n")
    expect(tail.text()).toBe(`${"x".repeat(9)}\n`)
  })

  it("bounds a flood of output at MAX_OUTPUT_CHARS by default", () => {
    const tail = outputTail()
    const line = `${"y".repeat(99)}\n`
    for (let index = 0; index < 20_000; index += 1) tail.push(line)
    tail.push("last\n")
    const text = tail.text()
    expect(MAX_OUTPUT_CHARS).toBe(65_536)
    expect(text.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS)
    expect(text.length).toBeGreaterThan(MAX_OUTPUT_CHARS - line.length)
    expect(text.startsWith("y")).toBe(true)
    expect(text.endsWith(`${line}last\n`)).toBe(true)
  })
})

describe("stopProcessGroup()", () => {
  const errno = (code: string) => Object.assign(new Error(code), { code })

  it("sends SIGKILL to the whole process group", () => {
    const sent: [number, string][] = []
    expect(stopProcessGroup((pid: number, signal: string) => sent.push([pid, signal]), 4321)).toBe(
      true,
    )
    expect(sent).toEqual([[-4321, "SIGKILL"]])
  })

  it("returns false when the group has already exited", () => {
    const gone = () => {
      throw errno("ESRCH")
    }
    expect(stopProcessGroup(gone, 4321)).toBe(false)
  })

  it("rethrows any other failure, such as EPERM", () => {
    const denied = () => {
      throw errno("EPERM")
    }
    expect(() => stopProcessGroup(denied, 4321)).toThrow("EPERM")
  })

  it("rethrows a thrown value that is not an error object", () => {
    // Some code throws a bare value, such as null, instead of an Error.
    const thrown: unknown = null
    let caught: unknown = "nothing thrown"
    try {
      stopProcessGroup(() => {
        throw thrown
      }, 4321)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeNull()
  })

  it("signals nothing for a child that never started", () => {
    const sent: unknown[] = []
    expect(stopProcessGroup((...args: unknown[]) => sent.push(args), undefined)).toBe(false)
    expect(sent).toEqual([])
  })
})

describe("repo-contract npm-script through the real bin", () => {
  const bin = path.resolve("bin/repo-contract.mjs")
  const spawnBin = (dir: string, argv: readonly string[]) =>
    spawnSync(process.execPath, [bin, "npm-script", ...argv], { cwd: dir, encoding: "utf8" })

  it("runs the script with npm, sees the file it wrote, and stops one that runs too long", () => {
    const dir = project({
      gen: `node -e "require('fs').writeFileSync('out.txt', 'x'); console.log('wrote')"`,
      slow: `node -e "setTimeout(() => {}, 60000)"`,
    })
    const gen = spawnBin(dir, ["gen", "--json", "--must-not-change", "out.txt"])
    expect(gen.status).toBe(1)
    expect(json(gen.stdout)).toMatchObject({
      state: "ran",
      exitCode: 0,
      timedOut: false,
      changed: ["out.txt"],
      output: "wrote",
    })
    const slow = spawnBin(dir, ["slow", "--json", "--timeout", "500"])
    expect(slow.status).toBe(1)
    expect(json(slow.stdout)).toMatchObject({ exitCode: null, timedOut: true })
  })

  it("reports the last 40 lines of a script that prints 20 MB", () => {
    const dir = project({
      flood: `node -e "for (let i = 1; i <= 200000; i++) console.log(i + ' ' + 'z'.repeat(100))"`,
    })
    const flood = spawnBin(dir, ["flood", "--json"])
    expect(flood.status).toBe(0)
    const lines = String(json(flood.stdout).output).split("\n")
    expect(lines).toHaveLength(40)
    expect(lines[0]).toBe(`199961 ${"z".repeat(100)}`)
    expect(lines.at(-1)).toBe(`200000 ${"z".repeat(100)}`)
  })
})
