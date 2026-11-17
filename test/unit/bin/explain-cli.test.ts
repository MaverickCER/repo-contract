import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { EXPLAIN_USAGE, parseExplainArgs, runExplain } from "../../../bin/explain-cli.mjs"
import * as engine from "../../../src/tiers/index.js"
import type { TierExplanation } from "../../../src/tiers/index.js"

const repoRoot = path.resolve(__dirname, "../../..")
// The scratch project has no node_modules, so tsx resolves from this repository, as it would from
// a consumer that installed it.
const requireFromRepo = () => createRequire(path.join(repoRoot, "package.json"))

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-explain-cli-"))
  scratch.push(dir)
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
  return dir
}

// The config file hands back a config this test built from the statically imported engine. Had it
// imported src/tiers itself, tsx would load a second copy of every tier module inside the test,
// and Stryker would credit those modules' load-time code to these tests alone.
const CONFIG_GLOBAL = "__repoContractExplainCliConfig"
Reflect.set(globalThis, CONFIG_GLOBAL, {
  spawn: () => undefined,
  ...engine.strict({ Coverage: { thresholds: { branches: 70 } } }),
})
const STRICT_CONFIG = `export default globalThis[${JSON.stringify(CONFIG_GLOBAL)}]\n`

async function invoke(
  argv: string[],
  cwd: string,
  require: (from: string) => NodeJS.Require = requireFromRepo,
  tiers: Pick<typeof engine, "explainTier" | "renderExplain"> = engine,
) {
  const out: string[] = []
  const err: string[] = []
  const code = await runExplain({
    argv,
    cwd,
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    engine: tiers,
    createRequire: require,
  })
  return { code, stdout: out.join(""), stderr: err.join("") }
}

describe("parseExplainArgs", () => {
  it("reads --config, the format and -C", () => {
    expect(parseExplainArgs([])).toStrictEqual({ kind: "run", options: { format: "text" } })
    expect(parseExplainArgs(["--config", "c.ts", "--json", "-C", "sub"])).toStrictEqual({
      kind: "run",
      options: { config: "c.ts", format: "json", cwd: "sub" },
    })
    expect(parseExplainArgs(["--markdown"])).toStrictEqual({
      kind: "run",
      options: { format: "markdown" },
    })
  })

  it.each([
    [["--json", "--markdown"], "choose one of --json and --markdown"],
    [["--bogus"], "unknown option '--bogus'"],
    [["--config"], "option '--config' needs a value"],
    [["extra"], "unexpected argument 'extra'"],
  ])("rejects %j", (argv, message) => {
    expect(parseExplainArgs(argv)).toEqual({ kind: "error", message })
  })
})

describe("R4 repo-contract explain", () => {
  it("loads repo-contract.config.mts through tsx and prints the text explanation", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const { code, stdout, stderr } = await invoke([], dir)
    expect(stderr).toBe("")
    expect(code).toBe(0)
    expect(stdout).toContain("Tier strict, compared with strict.")
    expect(stdout).toContain("Coverage branches: 70 (baseline 80)")
    expect(stdout).toContain("Planned for a later release:")
  }, 30_000)

  it("--json prints the TierExplanation with schemaVersion 1 and the config file", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const { code, stdout } = await invoke(["--json"], dir)
    expect(code).toBe(0)
    const explanation = JSON.parse(stdout) as TierExplanation & { config: string }
    expect(explanation).toMatchObject({
      schemaVersion: 1,
      tier: "strict",
      baseline: "strict",
      config: "repo-contract.config.mts",
    })
    expect(explanation.loosened).toEqual([
      { check: "Coverage", setting: "branches", baseline: 80, value: 70 },
    ])
  }, 30_000)

  it("--markdown prints the markdown rendering", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const { code, stdout } = await invoke(["--markdown"], dir)
    expect(code).toBe(0)
    expect(stdout).toContain("| Check | Status and settings |")
    expect(stdout).toContain("### Loosened")
  }, 30_000)

  it("--config picks another config file, and -C another directory", async () => {
    const dir = project({
      "repo-contract.config.mts": STRICT_CONFIG,
      "other.config.ts": "export default { checks: { lint: {} } }\n",
    })
    const { code, stdout } = await invoke(["--config", "other.config.ts", "--json"], dir)
    expect(code).toBe(0)
    const other = JSON.parse(stdout) as TierExplanation & { config: string }
    expect(other.config).toBe("other.config.ts")
    // JSON drops `undefined`: a config with no tier metadata has no `tier` key.
    expect(other.tier).toBeUndefined()
    expect(other.checks.map(({ id }) => id)).toEqual(["lint"])
    const parent = path.dirname(dir)
    const fromParent = await invoke(["-C", path.basename(dir), "--json"], parent)
    expect(JSON.parse(fromParent.stdout)).toMatchObject({ tier: "strict" })
  }, 30_000)

  it("prefers repo-contract.config.mts, then .ts, then .mjs", async () => {
    const dir = project({
      "repo-contract.config.ts": "export default { checks: { fromTs: {} } }\n",
      "repo-contract.config.mjs": "export default { checks: { fromMjs: {} } }\n",
    })
    const { stdout } = await invoke(["--json"], dir)
    expect(JSON.parse(stdout)).toMatchObject({ config: "repo-contract.config.ts" })
  }, 30_000)

  it("exits 1 with a message when the config cannot be loaded", async () => {
    const none = await invoke([], project({}))
    expect(none.code).toBe(1)
    expect(none.stderr).toContain("no repo-contract.config.mts, repo-contract.config.ts or")

    const missing = await invoke(["--config", "nope.ts"], project({}))
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain("nope.ts does not exist")

    const broken = await invoke(
      [],
      project({ "repo-contract.config.mts": "throw new Error('boom')\n" }),
    )
    expect(broken.code).toBe(1)
    expect(broken.stderr).toContain("could not load repo-contract.config.mts: boom")

    const noDefault = await invoke(
      [],
      project({ "repo-contract.config.mts": "export const x = 1\n" }),
    )
    expect(noDefault.code).toBe(1)
    expect(noDefault.stderr).toContain("has no default export with a checks object")
  }, 30_000)

  it("exits 1 when tsx cannot be resolved from the project", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const noTsx = () =>
      ({
        resolve: () => {
          throw new Error("Cannot find module 'tsx/esm/api'")
        },
      }) as unknown as NodeJS.Require
    const { code, stderr } = await invoke([], dir, noTsx)
    expect(code).toBe(1)
    expect(stderr).toContain("npm install --save-dev tsx")
  })

  it("rejects an unknown flag with exit 2", async () => {
    const { code, stdout, stderr } = await invoke(["--bogus"], project({}))
    expect(code).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toContain("repo-contract explain --help")
  })

  it("prints its help and version", async () => {
    const dir = project({})
    expect((await invoke(["--help"], dir)).stdout).toBe(`${EXPLAIN_USAGE}\n`)
    expect((await invoke(["-V"], dir)).stdout).toBe("9.9.9\n")
  })

  it("resolves tsx from the project's package.json", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const asked: string[] = []
    const recording = (from: string) => {
      asked.push(from)
      return requireFromRepo()
    }
    expect((await invoke([], dir, recording)).code).toBe(0)
    expect(asked).toEqual([path.join(dir, "package.json")])
  }, 30_000)

  it("names every default config file when none exists", async () => {
    const dir = project({})
    const { code, stderr } = await invoke([], dir)
    expect(code).toBe(1)
    expect(stderr).toBe(
      `repo-contract explain: no repo-contract.config.mts, repo-contract.config.ts or repo-contract.config.mjs in ${dir}. Name one with --config, or run \`repo-contract init --preset <tier>\`.\n`,
    )
  })

  it("reports a missing tsx as itself, not as a failed load", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const noTsx = () =>
      ({
        resolve: () => {
          throw new Error("Cannot find module 'tsx/esm/api'")
        },
      }) as unknown as NodeJS.Require
    expect((await invoke([], dir, noTsx)).stderr).toBe(
      "repo-contract explain: explain loads the config through tsx, which this project does not have. Run: npm install --save-dev tsx\n",
    )
  })

  it("prints a nested config's path with / separators", async () => {
    const dir = project({})
    mkdirSync(path.join(dir, "config"))
    writeFileSync(path.join(dir, "config", "rc.mts"), STRICT_CONFIG)
    const { code, stdout } = await invoke(["--config", "config/rc.mts", "--json"], dir)
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ config: "config/rc.mts" })
  }, 30_000)

  // A stand-in for tsx's API: the config module it "loads" is whatever the test puts in a global.
  const LOADED_GLOBAL = "__repoContractExplainCliLoaded"
  const fakeTsx = (dir: string) => {
    const api = path.join(dir, "fake-tsx.mjs")
    writeFileSync(
      api,
      `export const tsImport = async () => globalThis[${JSON.stringify(LOADED_GLOBAL)}]\n`,
    )
    return () => ({ resolve: () => api }) as unknown as NodeJS.Require
  }

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a null default export", { default: null }],
    ["a default export with null checks", { default: { checks: null } }],
    ["a default export with string checks", { default: { checks: "lint" } }],
    ["a nested default export with null checks", { default: { default: { checks: null } } }],
  ])("refuses a config module that is %s", async (_name, loaded) => {
    const dir = project({ "repo-contract.config.mts": "" })
    Reflect.set(globalThis, LOADED_GLOBAL, loaded)
    const { code, stderr } = await invoke([], dir, fakeTsx(dir))
    expect(code).toBe(1)
    expect(stderr).toBe(
      "repo-contract explain: repo-contract.config.mts has no default export with a checks object.\n",
    )
  })

  it("reads a CommonJS config's default export one level down", async () => {
    const dir = project({ "repo-contract.config.ts": "" })
    Reflect.set(globalThis, LOADED_GLOBAL, { default: { default: { checks: { lint: {} } } } })
    const { code, stdout } = await invoke(["--json"], dir, fakeTsx(dir))
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ config: "repo-contract.config.ts" })
  })

  it("exits 1 with the error when explaining the loaded config throws", async () => {
    const dir = project({ "repo-contract.config.mts": STRICT_CONFIG })
    const throwing = {
      ...engine,
      explainTier: () => {
        throw new Error("boom")
      },
    }
    const { code, stdout, stderr } = await invoke([], dir, requireFromRepo, throwing)
    expect(code).toBe(1)
    expect(stdout).toBe("")
    expect(stderr).toBe("repo-contract explain: failed: boom\n")
  }, 30_000)
})
