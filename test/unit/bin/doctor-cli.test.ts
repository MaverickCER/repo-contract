import path from "node:path"
import { describe, expect, it } from "vitest"
import { DOCTOR_USAGE, parseDoctorArgs, runDoctor } from "../../../bin/doctor-cli.mjs"
import { diagnose, planFixes } from "../../../src/affected/index.js"

/** A path under the pretend working directory, spelled the way this platform spells it. */
const at = (...parts: string[]): string => path.resolve("/work/project", ...parts)

interface Repo {
  files: Record<string, string>
  tracked?: string[]
  hooksPath?: string
}

const healthy: Repo = {
  files: {
    ".gitignore": ".repo-contract/cache/\n",
    "vitest.config.ts": "coverage: { reporter: ['json'] }",
    ".github/workflows/ci.yml":
      "- uses: actions/checkout@v4\n  with:\n    fetch-depth: 0\n- run: npm run contract\n",
    "src/index.ts": 'export { a } from "./a.js"\n',
    ".git/hooks/pre-commit": "#!/bin/sh\n",
  },
  tracked: ["vitest.config.ts", ".github/workflows/ci.yml", "src/index.ts", "src/a.ts"],
}

async function invoke(argv: string[], repo: Repo = healthy, failWrites = false) {
  const out: string[] = []
  const err: string[] = []
  const written: Record<string, string> = {}
  const files = { ...repo.files }
  const code = await runDoctor({
    argv,
    cwd: at(),
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    engine: { diagnose, planFixes },
    createCapabilities: () => ({
      git: async (args: string[]) => {
        if (args[0] === "ls-files") return (repo.tracked ?? Object.keys(files)).join("\0") + "\0"
        if (args[0] === "config")
          return repo.hooksPath === undefined ? undefined : `${repo.hooksPath}\n`
        return undefined
      },
      readFile: async (file: string) => files[file],
      writeFile: async (file: string, text: string) => {
        if (failWrites) throw new Error("disk full")
        written[file] = text
        files[file] = text
      },
    }),
  })
  return { code, stdout: out.join(""), stderr: err.join(""), written }
}

describe("parseDoctorArgs", () => {
  it("defaults to a text diagnosis that changes nothing", () => {
    expect(parseDoctorArgs([])).toEqual({ kind: "run", options: { fix: false, json: false } })
  })

  it("reads --fix, --json and -C", () => {
    expect(parseDoctorArgs(["--fix", "--json", "-C", "pkg"])).toEqual({
      kind: "run",
      options: { fix: true, json: true, cwd: "pkg" },
    })
    expect(parseDoctorArgs(["--fix"])).toMatchObject({ options: { fix: true } })
  })

  it.each([
    [["--help"], { kind: "help" }],
    [["-h"], { kind: "help" }],
    [["--version"], { kind: "version" }],
    [["-V"], { kind: "version" }],
    [["--bogus", "--help"], { kind: "help" }],
    [["--bogus"], { kind: "error", message: "unknown option '--bogus'" }],
    [["extra"], { kind: "error", message: "unexpected argument 'extra'" }],
    [["-C"], { kind: "error", message: "option '-C' needs a value" }],
    [["--fix=1"], { kind: "error", message: "option '--fix' does not take a value" }],
    [["--json=1"], { kind: "error", message: "option '--json' does not take a value" }],
    [["--", "x"], { kind: "error", message: "unexpected argument 'x'" }],
  ])("reads %j", (argv, expected) => {
    expect(parseDoctorArgs(argv)).toEqual(expected)
  })

  it("documents its options", () => {
    for (const text of ["--fix", "--json", "-C", "--help", "--version"]) {
      expect(DOCTOR_USAGE).toContain(text)
    }
  })
})

describe("runDoctor", () => {
  it("prints help and the version", async () => {
    expect((await invoke(["--help"])).stdout).toContain("Usage: repo-contract doctor")
    expect((await invoke(["--version"])).stdout).toBe("9.9.9\n")
  })

  it("reports a usage error on stderr with exit 2", async () => {
    const { code, stdout, stderr } = await invoke(["--bogus"])
    expect(code).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toContain("repo-contract doctor: unknown option '--bogus'")
    expect(stderr).toContain("Try 'repo-contract doctor --help'")
  })

  it("says so when there is nothing to change", async () => {
    const { code, stdout } = await invoke([])
    expect(code).toBe(0)
    expect(stdout).toBe("Nothing to change.\n")
  })

  it("lists each finding with its hint, and offers --fix when something is fixable", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "node_modules\n" } }
    const { code, stdout } = await invoke([], repo)
    expect(code).toBe(0)
    expect(stdout).toContain("warn  cache-not-ignored")
    expect(stdout).toContain("Add .repo-contract/cache/ to .gitignore")
    expect(stdout).toContain("Run with --fix to apply 1 safe change.")
  })

  it("does not offer --fix when nothing is fixable", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".git/hooks/pre-commit": "" } }
    delete (repo.files as Record<string, string | undefined>)[".git/hooks/pre-commit"]
    const { stdout } = await invoke([], repo)
    expect(stdout).toContain("info  hooks-missing")
    expect(stdout).not.toContain("--fix")
  })

  it("sees hooks installed through core.hooksPath", async () => {
    const files = { ...healthy.files }
    delete (files as Record<string, string | undefined>)[".git/hooks/pre-commit"]
    const { stdout } = await invoke([], { ...healthy, files, hooksPath: ".husky" })
    expect(stdout).toBe("Nothing to change.\n")
  })

  it("lists tracked source files that use export *", async () => {
    const repo = {
      ...healthy,
      files: {
        ...healthy.files,
        "src/index.ts": 'export * from "./a.js"\n',
        "src/a.test.ts": 'export * from "x"\n',
        "src/types.d.ts": 'export * from "y"\n',
      },
      tracked: [...(healthy.tracked ?? []), "src/a.test.ts", "src/types.d.ts"],
    }
    const { stdout } = await invoke([], repo)
    expect(stdout).toContain("star-exports")
    expect(stdout).toContain("src/index.ts")
    expect(stdout).not.toContain("a.test.ts")
    expect(stdout).not.toContain("types.d.ts")
  })

  it("--fix shows the change, writes it, and says so", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "node_modules\n" } }
    const { code, stdout, written } = await invoke(["--fix"], repo)
    expect(code).toBe(0)
    expect(written).toEqual({ ".gitignore": "node_modules\n.repo-contract/cache/\n" })
    expect(stdout).toContain("--- .gitignore")
    expect(stdout).toContain("+++ .gitignore")
    expect(stdout).toContain("+.repo-contract/cache/")
    expect(stdout).toContain("Applied 1 change.")
  })

  it("--fix is idempotent: a second run has nothing to apply", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "node_modules\n" } }
    const first = await invoke(["--fix"], repo)
    const second = await invoke(["--fix"], { ...repo, files: { ...repo.files, ...first.written } })
    expect(second.written).toEqual({})
    expect(second.stdout).toBe("Nothing to change.\n")
  })

  it("--fix leaves findings it cannot fix on the page", async () => {
    const repo = {
      ...healthy,
      files: {
        ...healthy.files,
        ".gitignore": "x\n",
        "vitest.config.ts": "coverage: { reporter: ['text'] }",
      },
    }
    const { stdout } = await invoke(["--fix"], repo)
    expect(stdout).toContain("Applied 1 change.")
    expect(stdout).toContain("coverage-json-reporter")
  })

  it("prints a versioned JSON document, with the planned changes", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "node_modules\n" } }
    const { stdout } = await invoke(["--json"], repo)
    const report = JSON.parse(stdout) as Record<string, unknown>
    expect(report).toMatchObject({ schemaVersion: 1, clean: false, applied: false })
    expect((report.findings as { id: string }[]).map((f) => f.id)).toEqual(["cache-not-ignored"])
    expect(report.changes).toEqual([
      {
        file: ".gitignore",
        before: "node_modules\n",
        after: "node_modules\n.repo-contract/cache/\n",
      },
    ])
  })

  it("--json --fix reports that the changes were applied", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "node_modules\n" } }
    const { stdout, written } = await invoke(["--json", "--fix"], repo)
    expect(JSON.parse(stdout)).toMatchObject({ applied: true })
    expect(Object.keys(written)).toEqual([".gitignore"])
  })

  it("exits 1 with a message when a write fails", async () => {
    const repo = { ...healthy, files: { ...healthy.files, ".gitignore": "" } }
    const { code, stderr } = await invoke(["--fix"], repo, true)
    expect(code).toBe(1)
    expect(stderr).toContain("repo-contract doctor: failed: disk full")
  })

  it("exits 1 when git cannot be run", async () => {
    const out: string[] = []
    const err: string[] = []
    const code = await runDoctor({
      argv: [],
      cwd: "/w",
      version: "1",
      stdout: (t: string) => out.push(t),
      stderr: (t: string) => err.push(t),
      engine: { diagnose, planFixes },
      createCapabilities: () => ({
        git: () => Promise.reject(new Error("spawn git ENOENT")),
        readFile: async () => undefined,
        writeFile: async () => undefined,
      }),
    })
    expect(code).toBe(1)
    expect(err.join("")).toContain("repo-contract doctor: failed: spawn git ENOENT")
  })

  it("reads a non-Error rejection as text", async () => {
    const err: string[] = []
    const code = await runDoctor({
      argv: [],
      cwd: "/w",
      version: "1",
      stdout: () => undefined,
      stderr: (t: string) => err.push(t),
      engine: { diagnose, planFixes },
      createCapabilities: () => ({
        git: () => {
          const thrown: unknown = "boom"
          throw thrown
        },
        readFile: async () => undefined,
        writeFile: async () => undefined,
      }),
    })
    expect(code).toBe(1)
    expect(err.join("")).toContain("failed: boom")
  })

  it("runs in the directory given with -C", async () => {
    const dirs: string[] = []
    await runDoctor({
      argv: ["-C", "pkg"],
      cwd: "/work",
      version: "1",
      stdout: () => undefined,
      stderr: () => undefined,
      engine: { diagnose, planFixes },
      createCapabilities: (dir: string) => {
        dirs.push(dir)
        return {
          git: async () => "",
          readFile: async () => undefined,
          writeFile: async () => undefined,
        }
      },
    })
    expect(dirs).toEqual([path.resolve("/work", "pkg")])
  })
})
