import { Ajv } from "ajv"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// The runner `init` writes, run for real in a scratch project. It imports "repo-contract", which
// resolves to dist/ through a symlink, so these cases need a build.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs")
const built = distBuilt(["index.js"])

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// Two checks with a known outcome each, so the verdict is fixed: one pass, one fail.
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
    broken: {
      run: [process.execPath, "-e", "process.exit(3)"],
      policy: ({ result }) => ({ outcome: "fail", rationale: \`broken exited \${String(result.exitCode)}.\` }),
    },
  },
})
`

/** A scratch project holding the runner `init` wrote and a config with two fixed checks. */
function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-contract-runner-"))
  scratch.push(dir)
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "p", private: true, devDependencies: { tsx: "^4.0.0" } })}\n`,
  )
  const init = spawnSync("node", [bin, "init"], { cwd: dir, encoding: "utf8" })
  expect(init.status).toBe(0)
  writeFileSync(path.join(dir, "repo-contract.config.mts"), CONFIG)
  mkdirSync(path.join(dir, "node_modules"))
  symlinkSync(root, path.join(dir, "node_modules", "repo-contract"), "junction")
  return dir
}

/** Runs the generated runner the way `scripts.contract` does: through tsx. */
const runner = (cwd: string, args: string[]) =>
  spawnSync("node", [tsx, "scripts/contract.mjs", ...args], { cwd, encoding: "utf8" })

function validator(name: string) {
  const schema = JSON.parse(readFileSync(path.join(root, "schemas", name), "utf8")) as object
  return new Ajv({ strict: false }).compile(schema)
}

describe.skipIf(!built)("the runner init writes (scripts/contract.mjs)", () => {
  it("prints one [OUTCOME] line per check without --json, and exits 1 on a fail", () => {
    const result = runner(project(), [])
    expect(result.stderr).toBe("")
    expect(result.stdout.trimEnd().split("\n")).toEqual([
      "[PASS] ok: ok exited 0.",
      "[FAIL] broken: broken exited 3.",
    ])
    expect(result.status).toBe(1)
  })

  it("prints the evidence and verdict documents as one JSON object with --json, and exits 1 on a fail", () => {
    const result = runner(project(), ["--json"])
    expect(result.stderr).toBe("")
    expect(result.status).toBe(1)

    const printed = JSON.parse(result.stdout) as { evidence: unknown; verdict: unknown }
    expect(Object.keys(printed)).toEqual(["evidence", "verdict"])
    expect(printed.verdict).toEqual({
      version: 2,
      passed: false,
      checks: {
        ok: { outcome: "pass", rationale: "ok exited 0." },
        broken: { outcome: "fail", rationale: "broken exited 3." },
      },
    })
    expect(printed.evidence).toMatchObject({
      checks: { ok: { exitCode: 0, stdout: "fine" }, broken: { exitCode: 3 } },
    })

    const evidenceValid = validator("evidence.schema.json")
    expect(evidenceValid(printed.evidence), JSON.stringify(evidenceValid.errors)).toBe(true)
    const verdictValid = validator("verdict.schema.json")
    expect(verdictValid(printed.verdict), JSON.stringify(verdictValid.errors)).toBe(true)
  })

  it("exits 0 with --json when every check passes", () => {
    const dir = project()
    writeFileSync(
      path.join(dir, "repo-contract.config.mts"),
      CONFIG.replace(/ {4}broken: \{[\s\S]*? {4}\},\n/, ""),
    )
    const result = runner(dir, ["--json"])
    expect(result.status).toBe(0)
    expect((JSON.parse(result.stdout) as { verdict: { passed: boolean } }).verdict.passed).toBe(
      true,
    )
  })
})
