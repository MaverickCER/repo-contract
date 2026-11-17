import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// The real bin in a scratch project. `init --preset` reads the tier's checks from dist/tiers.js,
// so these cases need a build.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const tiersBuilt = distBuilt(["tiers.js"])

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(packageJson: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-init-preset-"))
  scratch.push(dir)
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`)
  return dir
}

const run = (cwd: string, args: string[]) =>
  spawnSync("node", [bin, ...args], { cwd, encoding: "utf8" })

const read = (dir: string, file: string): string => readFileSync(path.join(dir, file), "utf8")

describe.skipIf(!tiersBuilt)("repo-contract init --preset", () => {
  it("writes a config spreading the tier, the runner and scripts.contract, and no workflow", () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0", eslint: "^9.0.0" } })
    const result = run(dir, ["init", "--preset", "strict"])
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)

    const config = read(dir, "repo-contract.config.mts")
    expect(config).toContain('import { strict } from "repo-contract/tiers"')
    expect(config).toMatch(/^ {2}\.\.\.strict\(\),$/m)
    expect(read(dir, "scripts/contract.mjs")).toContain("runRepoContract")
    expect(
      (JSON.parse(read(dir, "package.json")) as { scripts: { contract: string } }).scripts.contract,
    ).toBe("tsx scripts/contract.mjs")
    expect(existsSync(path.join(dir, ".github"))).toBe(false)

    expect(result.stdout).toContain("Tier strict")
    expect(result.stdout).toContain("Mutation needs @stryker-mutator/core")
    expect(result.stdout).not.toContain("Lint needs eslint")
    expect(result.stdout).toContain("npx repo-contract explain")
  })

  it("accepts --preset=<tier>", () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    const result = run(dir, ["init", "--preset=basic"])
    expect(result.status).toBe(0)
    expect(read(dir, "repo-contract.config.mts")).toContain("...basic(),")
    expect(result.stdout).not.toContain("Coverage needs")
  })

  it("keeps an existing config and says so", () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    writeFileSync(path.join(dir, "repo-contract.config.mts"), "// mine\n")
    const result = run(dir, ["init", "--preset", "app"])
    expect(result.status).toBe(0)
    expect(read(dir, "repo-contract.config.mts")).toBe("// mine\n")
    expect(result.stdout).toContain("repo-contract.config.mts (already exists)")
    expect(result.stdout).toMatch(
      /^repo-contract init: kept the existing repo-contract\.config\.mts, which spreads no tier\.$/m,
    )
    expect(result.stdout).not.toContain("initialized")
    expect(result.stdout).not.toContain("Tier app runs")
  })

  it("names the tier a kept config spreads when another tier is asked for", () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    expect(run(dir, ["init", "--preset", "app"]).status).toBe(0)
    const result = run(dir, ["init", "--preset=strict"])
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(read(dir, "repo-contract.config.mts")).toContain("...app(),")
    expect(result.stdout).toContain(
      "repo-contract init: kept the existing repo-contract.config.mts, which spreads tier app, not strict.",
    )
    expect(result.stdout).toContain("spread strict() in place of app()")
    expect(result.stdout).toContain("Tier app runs")
    expect(result.stdout).not.toContain("initialized")
    expect(result.stdout).not.toContain("Mutation needs")
  })

  it("says a kept config already spreads the tier asked for", () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    expect(run(dir, ["init", "--preset", "strict"]).status).toBe(0)
    const result = run(dir, ["init", "--preset", "strict"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      "repo-contract init: kept the existing repo-contract.config.mts, which already spreads tier strict.",
    )
    expect(result.stdout).toContain("Tier strict runs")
  })

  it.each([
    [["init", "--preset", "fleet"], "not a tier"],
    [["init", "--preset"], "needs a value"],
    [["init", "--preset", "--help-me"], "needs a value"],
    [["init", "--preset", "app", "--preset", "strict"], "only once"],
    [["init", "--bogus"], "unknown option"],
    [["init", "strict"], "unknown option"],
  ])("rejects %j with exit 2 and writes nothing", (args, message) => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    const result = run(dir, args)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain(message)
    expect(existsSync(path.join(dir, "repo-contract.config.mts"))).toBe(false)
    expect(existsSync(path.join(dir, "scripts"))).toBe(false)
  })

  it("documents --preset in its help", () => {
    const result = run(root, ["init", "--help"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("--preset <tier>")
  })

  it("writes a config that loads and carries the tier's metadata", () => {
    const dir = project({ name: "p", type: "module", devDependencies: { tsx: "^4.0.0" } })
    expect(run(dir, ["init", "--preset", "library"]).status).toBe(0)
    mkdirSync(path.join(dir, "node_modules"))
    symlinkSync(root, path.join(dir, "node_modules", "repo-contract"), "junction")
    writeFileSync(
      path.join(dir, "probe.mts"),
      [
        'import config from "./repo-contract.config.mts"',
        "console.log(JSON.stringify({ tier: config.tier.name, checks: Object.keys(config.checks), spawn: typeof config.spawn }))",
        "",
      ].join("\n"),
    )
    const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs")
    const probe = spawnSync("node", [tsx, "probe.mts"], { cwd: dir, encoding: "utf8" })
    expect(probe.stderr).toBe("")
    const loaded = JSON.parse(probe.stdout) as { tier: string; checks: string[]; spawn: string }
    expect(loaded.tier).toBe("library")
    expect(loaded.checks).toContain("QuickStart")
    expect(loaded.checks).not.toContain("Mutation")
    expect(loaded.spawn).toBe("function")

    symlinkSync(
      path.join(root, "node_modules", "tsx"),
      path.join(dir, "node_modules", "tsx"),
      "junction",
    )
    const explained = run(dir, ["explain", "--json"])
    expect(explained.stderr).toBe("")
    expect(explained.status).toBe(0)
    expect(JSON.parse(explained.stdout)).toMatchObject({
      schemaVersion: 1,
      tier: "library",
      config: "repo-contract.config.mts",
      loosened: [],
    })
  })
})

describe("repo-contract init without --preset", () => {
  it("leaves coverage, crap and mutation to the tiers, even when their tools are installed", () => {
    const dir = project({
      name: "p",
      devDependencies: {
        tsx: "^4.0.0",
        vitest: "^4.0.0",
        "@vitest/coverage-v8": "^4.0.0",
        "@danibram/crap4ts": "^1.0.0",
        "@stryker-mutator/core": "^9.0.0",
      },
    })
    const result = run(dir, ["init"])
    expect(result.status).toBe(0)
    const config = read(dir, "repo-contract.config.mts")
    expect(config).toContain("    test,")
    expect(config).not.toMatch(/coverage|crap|mutation/)
    expect(result.stdout).toMatch(/- coverage \(.*init --preset app.*\)/)
    expect(result.stdout).toMatch(/- mutation \(.*init --preset strict.*\)/)
  })
})
