import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// The contract test for the whole command: the real bin, the real git, the real TypeScript, in a
// real scratch repository. Needs `dist/` (the bin imports the built engine), which `npm run
// contract` builds first.

interface Report {
  scope: string
  fullBecause?: { reason: string; file: string }
  changedFiles: string[]
  affectedTests: string[]
  explanations: string[]
}

const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin/repo-contract.mjs")
const version = (
  JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string
  }
).version

const files: Record<string, string> = {
  "src/a.ts": "export const a = 1\n",
  "src/b.ts": 'import { a } from "./a.js"\nexport const b = a\n',
  "test/b.test.ts": 'import { b } from "../src/b.js"\nb\n',
  "test/other.test.ts": "export {}\n",
  "docs/spaced name.md": "x\n",
}

let repo: string
const git = (...args: string[]): string =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_DIR: undefined },
  })
const write = (name: string, content: string): void => {
  mkdirSync(path.dirname(path.join(repo, name)), { recursive: true })
  writeFileSync(path.join(repo, name), content)
}
const run = (args: string[], cwd = repo) =>
  spawnSync("node", [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_DIR: undefined },
  })

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "rc-affected-"))
  git("init", "-q", "-b", "main")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  git("config", "commit.gpgsign", "false")
  mkdirSync(path.join(repo, "node_modules"))
  symlinkSync(
    path.join(root, "node_modules/typescript"),
    path.join(repo, "node_modules/typescript"),
  )
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n")
  for (const [name, content] of Object.entries(files)) write(name, content)
  git("add", "-A")
  git("commit", "-q", "-m", "base")
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

const reset = (): void => {
  git("checkout", "-q", "--", ".")
  git("clean", "-fdq", "-e", "node_modules")
}

describe("repo-contract affected (real git, real TypeScript)", () => {
  it("reports a clean tree as having nothing affected", () => {
    const { status, stdout, stderr } = run(["affected", "--base", "HEAD", "--json"])
    expect(status).toBe(0)
    expect(stderr).toBe("")
    expect(JSON.parse(stdout)).toMatchObject({
      scope: "affected",
      changedFiles: [],
      affectedTests: [],
    })
  })

  it("follows an edit to the tests that reach it", () => {
    write("src/a.ts", "export const a = 2\n")
    const { status, stdout, stderr } = run(["affected", "--base", "HEAD", "--json", "--explain"])
    expect(status).toBe(0)
    expect(stderr).toBe("")
    const report = JSON.parse(stdout) as Report
    expect(report.changedFiles).toEqual(["src/a.ts"])
    expect(report.affectedTests).toEqual(["test/b.test.ts"])
    expect(report.explanations[0]).toMatch(/^test\/b\.test\.ts must run <- /)
    reset()
  })

  it("prints bare paths for scripting", () => {
    write("src/a.ts", "export const a = 3\n")
    expect(run(["affected", "--base", "HEAD", "--tests"])).toMatchObject({
      status: 0,
      stdout: "test/b.test.ts\n",
      stderr: "",
    })
    reset()
  })

  it("sees staged, unstaged and untracked changes", () => {
    write("src/a.ts", "export const a = 4\n")
    git("add", "src/a.ts")
    write("test/new.test.ts", "export {}\n")
    const report = JSON.parse(run(["affected", "--base", "HEAD", "--json"]).stdout) as Report
    expect(report.changedFiles).toEqual(["src/a.ts", "test/new.test.ts"])
    expect(report.affectedTests).toEqual(["test/b.test.ts", "test/new.test.ts"])
    reset()
    git("reset", "-q", "--hard")
  })

  it("handles deleted files and paths with spaces", () => {
    git("rm", "-q", "src/a.ts")
    write("docs/spaced name.md", "changed\n")
    const { status, stdout, stderr } = run(["affected", "--base", "HEAD", "--json"])
    expect(status).toBe(0)
    expect((JSON.parse(stdout) as Report).fullBecause).toMatchObject({
      reason: "unplaced-file",
      file: "docs/spaced name.md",
    })
    expect(stderr).toContain("running everything (unplaced-file: docs/spaced name.md)")
    git("reset", "-q", "--hard")
  })

  it("runs everything, success status, when there is no base to compare with", () => {
    const { status, stderr, stdout } = run(["affected", "--tests"])
    expect(status).toBe(0)
    expect(stdout).toBe("test/b.test.ts\ntest/other.test.ts\n")
    expect(stderr).toBe(
      "repo-contract affected: running everything (git-failed: merge-base -- no base to compare against)\n",
    )
  })

  it("honours -C", () => {
    write("src/a.ts", "export const a = 5\n")
    const { stdout } = run(["affected", "-C", repo, "--base", "HEAD", "--tests"], tmpdir())
    expect(stdout).toBe("test/b.test.ts\n")
    reset()
  })

  it("exits 1 with an install hint when TypeScript is not installed", () => {
    const bare = mkdtempSync(path.join(tmpdir(), "rc-affected-bare-"))
    try {
      const { status, stdout, stderr } = run(["affected"], bare)
      expect([status, stdout]).toEqual([1, ""])
      expect(stderr).toContain("could not load TypeScript")
      expect(stderr).toContain("npm install --save-dev typescript")
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})

describe("repo-contract (top level)", () => {
  it("prints help for every command on --help, exiting 0", () => {
    const { status, stdout, stderr } = run(["--help"])
    expect(status).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain("repo-contract init")
    expect(stdout).toContain("repo-contract affected")
  })

  it("prints the package version on --version", () => {
    expect(run(["--version"])).toMatchObject({ status: 0, stdout: `${version}\n`, stderr: "" })
  })

  it("routes `affected --help` to the command's own help", () => {
    const { status, stdout } = run(["affected", "--help"])
    expect(status).toBe(0)
    expect(stdout).toContain("Usage: repo-contract affected [options]")
  })

  it("reports an unknown command as a usage error, exit 2, on stderr", () => {
    const { status, stdout, stderr } = run(["bogus"])
    expect([status, stdout]).toEqual([2, ""])
    expect(stderr).toContain("unknown command 'bogus'")
    expect(stderr).toContain("repo-contract --help")
  })

  it("reports no command as a usage error", () => {
    const { status, stdout, stderr } = run([])
    expect([status, stdout]).toEqual([2, ""])
    expect(stderr).toContain("Usage:")
  })

  it("reports a usage error in `affected` as exit 2", () => {
    expect(run(["affected", "--bogus"])).toMatchObject({ status: 2, stdout: "" })
  })

  it("reports `init` misuse as exit 2", () => {
    const { status, stderr } = run(["init", "extra"])
    expect(status).toBe(2)
    expect(stderr).toContain("repo-contract init takes no arguments")
  })
})
