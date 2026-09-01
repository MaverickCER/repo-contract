import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Real-path coverage for scripts/install-hooks.mjs: it runs from `npm run setup`
 * in a fresh clone, so a wrong branch here means setup either silently fails to
 * wire the hooks or clobbers a contributor's own `core.hooksPath`. Each case runs
 * the actual script against a throwaway `git init` directory.
 */

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/install-hooks.mjs",
)

let dir: string

// `GIT_CEILING_DIRECTORIES` stops git's repository discovery from walking out of
// the throwaway dir into whatever ancestor repo the OS temp dir may live under --
// otherwise `git config --local` (here and in the script) could read an
// unrelated repo's config and the "outside a git checkout" case would be bogus.
function gitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, GIT_CEILING_DIRECTORIES: dir, ...extra }
}

function runScript(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: "utf8",
    // Drop an inherited CI var so the default case isn't accidentally skipped.
    env: gitEnv({ CI: undefined, ...env }),
  })
}

function gitConfig(key: string): string {
  const result = spawnSync("git", ["config", "--local", "--get", key], {
    cwd: dir,
    encoding: "utf8",
    env: gitEnv(),
  })
  return result.status === 0 ? result.stdout.trim() : ""
}

function hooksPath(): string {
  return gitConfig("core.hooksPath")
}

function commitTemplate(): string {
  return gitConfig("commit.template")
}

beforeEach(() => {
  // realpathSync: on macOS os.tmpdir() is a symlink, and the spawned script
  // reports its cwd as the resolved path -- so compare against that.
  dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "repo-contract-install-hooks-")))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("install-hooks in a git checkout", () => {
  beforeEach(() => {
    execFileSync("git", ["init", "-q"], { cwd: dir, env: gitEnv() })
  })

  it("points core.hooksPath at .githooks", () => {
    const result = runScript()
    expect(result.status).toBe(0)
    expect(hooksPath()).toBe(".githooks")
  })

  it("is idempotent on a second run", () => {
    runScript()
    const second = runScript()
    expect(second.status).toBe(0)
    expect(hooksPath()).toBe(".githooks")
    expect(commitTemplate()).toBe(path.join(dir, ".gitmessage"))
  })

  it("points commit.template at an absolute .gitmessage path", () => {
    const result = runScript()
    expect(result.status).toBe(0)
    const value = commitTemplate()
    expect(path.isAbsolute(value)).toBe(true)
    expect(value).toBe(path.join(dir, ".gitmessage"))
  })

  it("does nothing when CI is set", () => {
    const result = runScript({ CI: "1" })
    expect(result.status).toBe(0)
    expect(hooksPath()).toBe("")
    expect(commitTemplate()).toBe("")
  })

  it("leaves a contributor's own core.hooksPath untouched", () => {
    execFileSync("git", ["config", "--local", "core.hooksPath", ".my-hooks"], { cwd: dir })
    const result = runScript()
    expect(result.status).toBe(0)
    expect(result.stderr).toMatch(/leaving it/)
    expect(hooksPath()).toBe(".my-hooks")
  })

  it("leaves a contributor's own commit.template untouched", () => {
    execFileSync("git", ["config", "--local", "commit.template", ".my-message"], { cwd: dir })
    const result = runScript()
    expect(result.status).toBe(0)
    expect(result.stderr).toMatch(/leaving it/)
    expect(commitTemplate()).toBe(".my-message")
    // The unrelated setting still gets wired.
    expect(hooksPath()).toBe(".githooks")
  })
})

describe("install-hooks outside a git checkout", () => {
  it("exits 0 without writing any config", () => {
    const result = runScript()
    expect(result.status).toBe(0)
    expect(hooksPath()).toBe("")
    expect(commitTemplate()).toBe("")
  })
})
