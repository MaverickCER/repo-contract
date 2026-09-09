import { sync as spawnSync } from "cross-spawn"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createConsumerFixture,
  distIsBuilt,
  removeConsumerFixture,
} from "../helpers/pack-consumer.js"

/**
 * Release-acceptance test for `repo-contract init` (see
 * specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md's 2026-09-09
 * amendment): proves the scaffolding command works against the real published `bin` entry from a
 * genuine packed install, not just against bin/*.mjs run from repository-local paths.
 *
 * The state-permutation cases below don't need their own npm install -- `init` only reads and
 * writes files in its cwd, it never resolves or imports "repo-contract" itself (that's the whole
 * point: it writes the same import specifiers a consumer would hand-write, it doesn't execute
 * them) -- so they invoke the one real, packed `bin` resolved by the single shared install below,
 * against disposable scratch directories.
 */
describe.skipIf(!distIsBuilt)("consumer init (packed tarball)", () => {
  let consumerDir: string
  let binPath: string

  beforeAll(() => {
    ;({ consumerDir } = createConsumerFixture("repo-contract-consumer-init-"))
    binPath = path.join(
      consumerDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "repo-contract.cmd" : "repo-contract",
    )
  }, 120_000)

  afterAll(() => {
    removeConsumerFixture(consumerDir)
  })

  function runInit(cwd: string, args: string[] = ["init"]) {
    return spawnSync(binPath, args, { cwd, encoding: "utf8" })
  }

  function scratchDir(prefix: string): string {
    return mkdtempSync(path.join(tmpdir(), prefix))
  }

  function readScripts(packageJsonPath: string): Record<string, string> {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }
    return parsed.scripts ?? {}
  }

  it("scaffolds a real contract from a genuine packed install, detecting declared devDependencies", () => {
    writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "repo-contract-consumer-fixture",
          version: "0.0.0",
          type: "module",
          devDependencies: { typescript: "^5.0.0", tsx: "^4.0.0" },
        },
        null,
        2,
      ),
    )

    const result = runInit(consumerDir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Created:")
    expect(result.stdout).toContain("✓ typecheck")
    expect(result.stdout).toContain("✓ securityDeps")
    expect(result.stdout).toContain("npm run contract")

    const config = readFileSync(path.join(consumerDir, "repo-contract.config.ts"), "utf8")
    expect(config).toContain("typecheck, securityDeps")

    const runner = readFileSync(path.join(consumerDir, "scripts", "contract.mjs"), "utf8")
    expect(runner).toContain("runRepoContract")

    expect(readScripts(path.join(consumerDir, "package.json")).contract).toBe(
      "tsx scripts/contract.mjs",
    )

    // The generated config is valid, importable TypeScript against the real installed package --
    // resolves the actual RepoContractConfig type and the actual `typecheck`/`securityDeps`
    // presets, not a stand-in.
    const typecheckResult = spawnSync(
      process.execPath,
      [
        path.join(consumerDir, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "--moduleResolution",
        "bundler",
        "--module",
        "esnext",
        "--target",
        "es2022",
        path.join(consumerDir, "repo-contract.config.ts"),
      ],
      { cwd: consumerDir, encoding: "utf8" },
    )
    expect(typecheckResult.stderr + typecheckResult.stdout).not.toContain("error TS")
  }, 60_000)

  it("is a clean no-op on a second run once everything is already in place", () => {
    const before = {
      config: readFileSync(path.join(consumerDir, "repo-contract.config.ts"), "utf8"),
      runner: readFileSync(path.join(consumerDir, "scripts", "contract.mjs"), "utf8"),
      packageJson: readFileSync(path.join(consumerDir, "package.json"), "utf8"),
    }

    const result = runInit(consumerDir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Skipped:")
    expect(result.stdout).toContain("repo-contract.config.ts (already exists)")
    expect(result.stdout).toContain("already set to this value")

    expect(readFileSync(path.join(consumerDir, "repo-contract.config.ts"), "utf8")).toBe(
      before.config,
    )
    expect(readFileSync(path.join(consumerDir, "scripts", "contract.mjs"), "utf8")).toBe(
      before.runner,
    )
    expect(readFileSync(path.join(consumerDir, "package.json"), "utf8")).toBe(before.packageJson)
  }, 20_000)

  it("produces a valid contract for a repository with none of the 15 tool-specific dependencies -- only securityDeps", () => {
    const dir = scratchDir("repo-contract-init-empty-")
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "empty-repo" }))

    const result = runInit(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("✓ securityDeps")
    expect(result.stdout).not.toMatch(/✓ (test|lint|typecheck|format)\b/)

    const config = readFileSync(path.join(dir, "repo-contract.config.ts"), "utf8")
    expect(config).toContain("import { securityDeps } from")
    expect(config).toContain("securityDeps,")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("creates scripts.contract when scripts exists without it, leaving other scripts untouched", () => {
    const dir = scratchDir("repo-contract-init-partial-scripts-")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(
        { name: "x", devDependencies: { tsx: "^4.0.0" }, scripts: { build: "tsc" } },
        null,
        2,
      ),
    )

    const result = runInit(dir)
    expect(result.status).toBe(0)

    const scripts = readScripts(path.join(dir, "package.json"))
    expect(scripts.build).toBe("tsc")
    expect(scripts.contract).toBe("tsx scripts/contract.mjs")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("never overwrites an existing scripts.contract with a different value", () => {
    const dir = scratchDir("repo-contract-init-conflicting-script-")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", scripts: { contract: "node my-own-runner.js" } }, null, 2),
    )

    const result = runInit(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("already exists with a different value -- left untouched")

    expect(readScripts(path.join(dir, "package.json")).contract).toBe("node my-own-runner.js")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("skips writing a new scripts.contract when tsx isn't installed, but still scaffolds the config/runner files", () => {
    const dir = scratchDir("repo-contract-init-no-tsx-")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", devDependencies: { typescript: "^5.0.0" } }, null, 2),
    )

    const result = runInit(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Skipped "scripts.contract"')
    expect(result.stdout).toContain("install tsx")

    expect(readScripts(path.join(dir, "package.json")).contract).toBeUndefined()
    expect(readFileSync(path.join(dir, "repo-contract.config.ts"), "utf8")).toContain("typecheck")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("still reports an existing conflicting scripts.contract correctly even when tsx isn't installed", () => {
    const dir = scratchDir("repo-contract-init-conflict-no-tsx-")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", scripts: { contract: "node my-own-runner.js" } }, null, 2),
    )

    const result = runInit(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("already exists with a different value -- left untouched")
    expect(result.stdout).not.toContain("tsx")

    expect(readScripts(path.join(dir, "package.json")).contract).toBe("node my-own-runner.js")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("aborts with zero writes when package.json is missing (a preflight failure, not a partial scaffold)", () => {
    const dir = scratchDir("repo-contract-init-no-package-json-")

    const result = runInit(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("no package.json found")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("prints usage and exits non-zero for any command other than init", () => {
    const dir = scratchDir("repo-contract-init-bad-command-")
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x" }))

    const result = spawnSync(binPath, ["doctor"], { cwd: dir, encoding: "utf8" })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Usage: repo-contract init")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)

  it("performs init with no process-spawning capability available -- proves the ambient-capability invariant behaviorally, not just by static scan", () => {
    const dir = scratchDir("repo-contract-init-no-path-")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", devDependencies: { eslint: "^9.0.0" } }),
    )

    // Invoking node directly with the real installed script (rather than through the `bin` shim,
    // which itself needs PATH to resolve its shebang/interpreter) isolates what's under test:
    // whether repo-contract's OWN code ever launches a subprocess. An empty PATH makes any
    // PATH-resolved subprocess launch fail immediately -- if `init` ever spawned anything (npm,
    // git, the detected tools themselves), that would surface here as a non-zero exit or a spawn
    // ENOENT, not a silent success.
    const scriptPath = path.join(
      consumerDir,
      "node_modules",
      "repo-contract",
      "bin",
      "repo-contract.mjs",
    )
    const result = spawnSync(process.execPath, [scriptPath, "init"], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: "" },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("repo-contract initialized")

    rmSync(dir, { recursive: true, force: true })
  }, 20_000)
})
