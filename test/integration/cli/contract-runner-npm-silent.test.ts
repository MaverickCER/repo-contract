import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// README.md, GUIDE.md and the agent skill tell an agent to run `npm run --silent contract -- --json`
// and say `--silent` keeps npm's banner out of the JSON. This runs that exact command through npm,
// with and without `--silent`, in a scratch project holding the runner `init` wrote. The runner
// imports "repo-contract", which resolves to dist/ through a symlink, so these cases need a build.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs")
const built = distBuilt(["index.js"])

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// One check that passes, so the verdict is fixed and the exit code is 0.
const CONFIG = `import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    ok: {
      run: [process.execPath, "-e", "process.stdout.write('fine')"],
      policy: () => ({ outcome: "pass", rationale: "ok exited 0." }),
    },
  },
})
`

/** @returns A scratch project whose `scripts.contract` is the one `init` writes, with tsx on its PATH. */
function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-npm-silent-"))
  scratch.push(dir)
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "p", version: "1.0.0", private: true, devDependencies: { tsx: "^4.0.0" } })}\n`,
  )
  const init = spawnSync("node", [bin, "init"], { cwd: dir, encoding: "utf8" })
  expect(init.status).toBe(0)
  writeFileSync(path.join(dir, "repo-contract.config.mts"), CONFIG)
  mkdirSync(path.join(dir, "node_modules", ".bin"), { recursive: true })
  symlinkSync(root, path.join(dir, "node_modules", "repo-contract"), "junction")
  symlinkSync(tsxCli, path.join(dir, "node_modules", ".bin", "tsx"))
  return dir
}

/**
 * The test's environment without npm's own variables. An outer `npm run --silent` exports
 * `npm_config_loglevel=silent`, which would hide the banner from the case that expects it.
 * @returns A copy of the environment.
 */
function cleanEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries<string | undefined>(
    Object.entries(process.env).filter(([name]) => !/^npm_/i.test(name)),
  )
}

const npmRun = (cwd: string, args: string[]) =>
  spawnSync("npm", ["run", ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnvironment(),
    shell: process.platform === "win32",
  })

describe.skipIf(!built)("npm run --silent contract -- --json", () => {
  it("prints only the JSON object, so stdout parses whole", () => {
    const result = npmRun(project(), ["--silent", "contract", "--", "--json"])
    expect(result.status, result.stderr).toBe(0)
    const printed = JSON.parse(result.stdout) as { evidence: unknown; verdict: unknown }
    expect(Object.keys(printed)).toEqual(["evidence", "verdict"])
    expect(printed.verdict).toMatchObject({ passed: true })
  })

  it("without --silent, npm's banner lands in stdout and the JSON no longer parses", () => {
    const result = npmRun(project(), ["contract", "--", "--json"])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("> p@1.0.0 contract")
    expect(() => JSON.parse(result.stdout) as unknown).toThrow(SyntaxError)
  })
})
