import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { INIT_USAGE, parseInitArgs, renderInitReport, runInit } from "../../../bin/init-cli.mjs"
import type { InitOutcome } from "../../../bin/init-cli.mjs"
import { patchContractScript } from "../../../bin/package-json-patch.mjs"
import {
  AGENT_COMMAND,
  DIST_OUTPUT,
  NPM_LOCKFILE,
  NPM_SCRIPT,
  PUBLISHED_PACKAGE,
  QUICK_START_BLOCK,
  detectPresets,
  missingTierTools,
} from "../../../bin/preset-catalog.mjs"
import {
  buildConfigTemplate,
  buildTierConfigTemplate,
  CONTRACT_RUNNER_TEMPLATE,
} from "../../../bin/templates.mjs"
import { tierChecks } from "../../../src/tiers/index.js"

const SCRIPT = "tsx scripts/contract.mjs"

describe("parseInitArgs", () => {
  it("runs the flat init with no arguments", () => {
    expect(parseInitArgs([])).toStrictEqual({ kind: "run", tier: undefined })
  })

  it.each([[["--help"]], [["-h"]], [["--preset", "app", "-h"]], [["--bogus", "--help"]]])(
    "asks for help with %j, whatever else is given",
    (argv) => {
      expect(parseInitArgs(argv)).toStrictEqual({ kind: "help" })
    },
  )

  it.each([
    [["--preset", "app"], "app"],
    [["--preset=basic"], "basic"],
    [["--preset", "library"], "library"],
    [["--preset=strict"], "strict"],
  ])("reads the tier from %j", (argv, tier) => {
    expect(parseInitArgs(argv)).toStrictEqual({ kind: "run", tier })
  })

  it.each([
    [["--bogus"], "unknown option '--bogus'"],
    [["strict"], "unknown option 'strict'"],
    [["--preset=basic", "--bogus"], "unknown option '--bogus'"],
    [["--preset", "app", "extra"], "unknown option 'extra'"],
    [["--preset"], "option '--preset' needs a value"],
    [["--preset="], "option '--preset' needs a value"],
    [["--preset", "-x"], "option '--preset' needs a value"],
    [["--preset=-x"], "option '--preset' needs a value"],
    [["--preset", "app", "--preset", "strict"], "give --preset only once"],
    [["--preset=app", "--preset=app"], "give --preset only once"],
    [["--preset", "fleet"], "'fleet' is not a tier: choose basic, app, library, strict"],
    [["--preset=Strict"], "'Strict' is not a tier: choose basic, app, library, strict"],
  ])("refuses %j", (argv, message) => {
    expect(parseInitArgs(argv)).toStrictEqual({ kind: "error", message })
  })
})

/** A report input for a fresh flat init; each case overrides what it is about. */
const outcome = (overrides: Partial<InitOutcome> = {}): InitOutcome => ({
  configCreated: true,
  runnerCreated: true,
  scriptStatus: "created",
  detected: [],
  skipped: [],
  flat: true,
  headline: ["repo-contract initialized"],
  tier: undefined,
  rerun: "repo-contract init",
  ...overrides,
})

describe("renderInitReport", () => {
  it("lists what a flat init created, detected and left out, with each reason", () => {
    const text = renderInitReport(
      outcome({
        detected: ["lint", "securityDeps"],
        skipped: [
          { preset: "test", dependency: "vitest" },
          { preset: "mutation", dependency: ["a", "b"] },
          { preset: "coverage", dependency: "@vitest/coverage-v8" },
          { preset: "crap", dependency: "@danibram/crap4ts" },
          { preset: "distNoUrls", dependency: DIST_OUTPUT },
          { preset: "aiReview", dependency: AGENT_COMMAND },
          { preset: "bundledDependencies", dependency: PUBLISHED_PACKAGE },
          { preset: "quickStart", dependency: QUICK_START_BLOCK },
          { preset: "sbom", dependency: NPM_LOCKFILE },
          { preset: "npmScript", dependency: NPM_SCRIPT },
          { preset: "e2e", dependency: ["x", "y"] },
        ],
      }),
    )
    expect(text).toBe(
      [
        "repo-contract initialized",
        "",
        "Created:",
        "  ✓ repo-contract.config.mts",
        "  ✓ scripts/contract.mjs",
        "",
        'Added "scripts.contract" to package.json.',
        "",
        "Detected:",
        "  ✓ lint",
        "  ✓ securityDeps",
        "",
        "Not detected (install the tool to add its check):",
        "  - test (vitest not installed)",
        "  - mutation (a tier orders it after the tests; use `repo-contract init --preset strict`)",
        "  - coverage (a tier orders it after the tests; use `repo-contract init --preset app`)",
        "  - crap (a tier orders it after the tests; use `repo-contract init --preset strict`)",
        "  - distNoUrls (package.json names no dist/ build output)",
        "  - aiReview (runs the AI agent you name; see GUIDE.md#ai-review-checks)",
        "  - bundledDependencies (package.json is private, so npm never publishes it)",
        "  - quickStart (runs the README block you mark; see GUIDE.md#presets)",
        "  - sbom (checks SBOM documents you write and commit first; see GUIDE.md#keep-an-sbom-current)",
        "  - npmScript (runs the npm script you name; see GUIDE.md#presets)",
        "  - e2e (x,y not installed)",
        "",
        "Next:",
        "  npm run contract",
      ].join("\n"),
    )
  })

  it("lists kept files, an unchanged script, and no left-out block when nothing was left out", () => {
    const text = renderInitReport(
      outcome({ configCreated: false, runnerCreated: false, scriptStatus: "unchanged" }),
    )
    expect(text).toBe(
      [
        "repo-contract initialized",
        "",
        "Skipped:",
        "  - repo-contract.config.mts (already exists)",
        "  - scripts/contract.mjs (already exists)",
        "",
        '"scripts.contract" already set to this value.',
        "",
        "Detected:",
        "",
        "Next:",
        "  npm run contract",
      ].join("\n"),
    )
  })

  it("lists a created config beside a kept runner, a conflicting script, and a tier's missing tools", () => {
    const text = renderInitReport(
      outcome({
        runnerCreated: false,
        scriptStatus: "conflict",
        flat: false,
        headline: ["first line", "second line"],
        tier: {
          name: "app",
          checks: ["Format", "Lint"],
          missing: [
            { check: "Format", dependency: "prettier" },
            { check: "Lint", dependency: "eslint" },
          ],
        },
      }),
    )
    expect(text).toBe(
      [
        "first line",
        "second line",
        "",
        "Created:",
        "  ✓ repo-contract.config.mts",
        "",
        "Skipped:",
        "  - scripts/contract.mjs (already exists)",
        "",
        '"scripts.contract" already exists with a different value, so it was left untouched.',
        "",
        "Tier app runs 2 checks: Format, Lint.",
        "",
        "Not installed (add each as a devDependency, or turn its check off with app({ <Check>: false })):",
        "  - Format needs prettier",
        "  - Lint needs eslint",
        "",
        "Next:",
        "  npx repo-contract explain",
        "  npm run contract",
      ].join("\n"),
    )
  })

  it("asks for tsx, then the same init, explain and the contract, for a tier with every tool", () => {
    const text = renderInitReport(
      outcome({
        configCreated: false,
        scriptStatus: "tsx-missing",
        flat: false,
        headline: ["h"],
        tier: { name: "basic", checks: ["Format"], missing: [] },
        rerun: "repo-contract init --preset=basic",
      }),
    )
    expect(text).toBe(
      [
        "h",
        "",
        "Created:",
        "  ✓ scripts/contract.mjs",
        "",
        "Skipped:",
        "  - repo-contract.config.mts (already exists)",
        "",
        'Skipped "scripts.contract": install tsx as a devDependency, then run `repo-contract init --preset=basic` again.',
        "",
        "Tier basic runs 1 checks: Format.",
        "",
        "Next:",
        "  npm install --save-dev tsx",
        "  npx repo-contract init --preset=basic",
        "  npx repo-contract explain",
        "  npm run contract",
      ].join("\n"),
    )
  })

  it("leaves out explain after a flat init that lacks tsx", () => {
    const text = renderInitReport(outcome({ scriptStatus: "tsx-missing" }))
    expect(text.slice(text.indexOf("Next:"))).toBe(
      [
        "Next:",
        "  npm install --save-dev tsx",
        "  npx repo-contract init",
        "  npm run contract",
      ].join("\n"),
    )
  })

  it("names no tier for a kept config that spreads none, and still offers explain", () => {
    const text = renderInitReport(outcome({ flat: false, headline: ["kept"] }))
    expect(text).toBe(
      [
        "kept",
        "",
        "Created:",
        "  ✓ repo-contract.config.mts",
        "  ✓ scripts/contract.mjs",
        "",
        'Added "scripts.contract" to package.json.',
        "",
        "Next:",
        "  npx repo-contract explain",
        "  npm run contract",
      ].join("\n"),
    )
  })
})

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A scratch project holding `packageJson` (raw text when a string; none when `undefined`). */
function project(packageJson?: unknown): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "rc-init-cli-")))
  scratch.push(dir)
  if (packageJson !== undefined) {
    const text =
      typeof packageJson === "string" ? packageJson : `${JSON.stringify(packageJson, null, 2)}\n`
    writeFileSync(path.join(dir, "package.json"), text)
  }
  return dir
}

const read = (dir: string, file: string): string => readFileSync(path.join(dir, file), "utf8")

const tiers = async () => ({ tierChecks })

/** Runs init in `cwd` and collects what it printed. */
async function init(cwd: string, argv: string[], loadTiers: () => Promise<unknown> = tiers) {
  const out: string[] = []
  const err: string[] = []
  const code = await runInit({
    argv,
    cwd,
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    loadTiers: loadTiers as () => Promise<{ tierChecks: (name: string) => readonly string[] }>,
  })
  return { code, stdout: out.join(""), stderr: err.join("") }
}

describe("runInit: arguments", () => {
  it("prints its help on stdout and writes nothing", async () => {
    const dir = project({ name: "p" })
    expect(await init(dir, ["--help"])).toStrictEqual({
      code: 0,
      stdout: `${INIT_USAGE}\n`,
      stderr: "",
    })
    expect(INIT_USAGE).toMatch(/^Usage: repo-contract init \[--preset <tier>\]\n/)
    expect(existsSync(path.join(dir, "repo-contract.config.mts"))).toBe(false)
  })

  it("reports a usage error on stderr with exit 2, and writes nothing", async () => {
    const dir = project({ name: "p" })
    expect(await init(dir, ["--preset", "fleet"])).toStrictEqual({
      code: 2,
      stdout: "",
      stderr:
        "repo-contract init: 'fleet' is not a tier: choose basic, app, library, strict\nTry 'repo-contract init --help' for more information.\n",
    })
    expect(existsSync(path.join(dir, "scripts"))).toBe(false)
  })
})

describe("runInit: a flat config", () => {
  const manifest = { name: "p", devDependencies: { tsx: "^4.0.0", eslint: "^9.0.0" } }

  it("writes the config, the runner and scripts.contract, and never loads the tiers", async () => {
    const dir = project(manifest)
    const before = read(dir, "package.json")
    const { detected, skipped } = detectPresets(manifest)
    const result = await init(dir, [], () => Promise.reject(new Error("tiers loaded")))
    expect(result).toStrictEqual({
      code: 0,
      stdout: `${renderInitReport(outcome({ detected, skipped }))}\n`,
      stderr: "",
    })
    expect(read(dir, "repo-contract.config.mts")).toBe(buildConfigTemplate(detected))
    expect(read(dir, "scripts/contract.mjs")).toBe(CONTRACT_RUNNER_TEMPLATE)
    expect(read(dir, "package.json")).toBe(patchContractScript(before, SCRIPT).text)
    expect(read(dir, "package.json")).toContain(`"contract": "${SCRIPT}"`)
  })

  it("keeps every file on a second run and says the script is already set", async () => {
    const dir = project(manifest)
    await init(dir, [])
    const after = ["repo-contract.config.mts", "scripts/contract.mjs", "package.json"].map((file) =>
      read(dir, file),
    )
    const { detected, skipped } = detectPresets(manifest)
    expect(await init(dir, [])).toStrictEqual({
      code: 0,
      stdout: `${renderInitReport(
        outcome({
          configCreated: false,
          runnerCreated: false,
          scriptStatus: "unchanged",
          detected,
          skipped,
        }),
      )}\n`,
      stderr: "",
    })
    expect(
      ["repo-contract.config.mts", "scripts/contract.mjs", "package.json"].map((file) =>
        read(dir, file),
      ),
    ).toEqual(after)
  })

  it("writes into an existing scripts/ directory", async () => {
    const dir = project(manifest)
    mkdirSync(path.join(dir, "scripts"))
    writeFileSync(path.join(dir, "scripts/other.mjs"), "x")
    expect((await init(dir, [])).code).toBe(0)
    expect(read(dir, "scripts/contract.mjs")).toBe(CONTRACT_RUNNER_TEMPLATE)
  })

  it("leaves package.json alone without tsx, and says to install it", async () => {
    const manifestWithoutTsx = { name: "p", devDependencies: {} }
    const dir = project(manifestWithoutTsx)
    const before = read(dir, "package.json")
    const { detected, skipped } = detectPresets(manifestWithoutTsx)
    expect(await init(dir, [])).toStrictEqual({
      code: 0,
      stdout: `${renderInitReport(outcome({ scriptStatus: "tsx-missing", detected, skipped }))}\n`,
      stderr: "",
    })
    expect(read(dir, "package.json")).toBe(before)
    expect(read(dir, "scripts/contract.mjs")).toBe(CONTRACT_RUNNER_TEMPLATE)
  })

  it.each([
    ["with tsx", { tsx: "^4.0.0" }],
    ["without tsx", {}],
  ])("reports a different scripts.contract as a conflict %s, and keeps it", async (_l, dev) => {
    const manifestWithScript = { name: "p", scripts: { contract: "mine" }, devDependencies: dev }
    const dir = project(manifestWithScript)
    const before = read(dir, "package.json")
    const { detected, skipped } = detectPresets(manifestWithScript)
    expect((await init(dir, [])).stdout).toBe(
      `${renderInitReport(outcome({ scriptStatus: "conflict", detected, skipped }))}\n`,
    )
    expect(read(dir, "package.json")).toBe(before)
  })

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "never writes package.json when scripts.contract is already set, even with tsx",
    async () => {
      const dir = project({ name: "p" })
      for (const contract of ["mine", SCRIPT]) {
        const manifestWithScript = {
          name: "p",
          scripts: { contract },
          devDependencies: { tsx: "1" },
        }
        writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifestWithScript))
        // Read-only, so any write to it fails the run: rewriting the same bytes would pass unseen.
        chmodSync(path.join(dir, "package.json"), 0o444)
        try {
          const result = await init(dir, [])
          expect(result.stderr).toBe("")
          expect(result.code).toBe(0)
        } finally {
          chmodSync(path.join(dir, "package.json"), 0o644)
        }
      }
    },
  )

  it("reads tsx only from devDependencies", async () => {
    const dir = project({ name: "p", dependencies: { tsx: "^4.0.0" } })
    expect((await init(dir, [])).stdout).toContain('Skipped "scripts.contract"')
  })
})

describe("runInit: --preset", () => {
  it("writes a config spreading the tier, and lists the tier's checks and missing tools", async () => {
    const manifest = { name: "p", devDependencies: { tsx: "^4.0.0", eslint: "^9.0.0" } }
    const dir = project(manifest)
    const checks = tierChecks("strict")
    expect(await init(dir, ["--preset", "strict"])).toStrictEqual({
      code: 0,
      stdout: `${renderInitReport(
        outcome({
          flat: false,
          headline: ["repo-contract initialized: tier strict"],
          tier: { name: "strict", checks, missing: missingTierTools(checks, manifest) },
          rerun: "repo-contract init --preset strict",
        }),
      )}\n`,
      stderr: "",
    })
    expect(read(dir, "repo-contract.config.mts")).toBe(buildTierConfigTemplate("strict"))
  })

  it("describes a kept config by the tier it spreads, not the one asked for", async () => {
    const manifest = { name: "p", devDependencies: { tsx: "^4.0.0" } }
    const dir = project(manifest)
    writeFileSync(path.join(dir, "repo-contract.config.mts"), buildTierConfigTemplate("app"))
    const checks = tierChecks("app")
    expect((await init(dir, ["--preset=strict"])).stdout).toBe(
      `${renderInitReport(
        outcome({
          configCreated: false,
          flat: false,
          headline: [
            "repo-contract init: kept the existing repo-contract.config.mts, which spreads tier app, not strict.",
            "To move to strict, spread strict() in place of app(), or delete the file and run init again.",
          ],
          tier: { name: "app", checks, missing: missingTierTools(checks, manifest) },
          rerun: "repo-contract init --preset=strict",
        }),
      )}\n`,
    )
    expect(read(dir, "repo-contract.config.mts")).toBe(buildTierConfigTemplate("app"))
  })

  it("names no tier for a kept config that spreads none", async () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    writeFileSync(path.join(dir, "repo-contract.config.mts"), "// mine\n")
    expect((await init(dir, ["--preset", "basic"])).stdout).toBe(
      `${renderInitReport(
        outcome({
          configCreated: false,
          flat: false,
          headline: [
            "repo-contract init: kept the existing repo-contract.config.mts, which spreads no tier.",
            "To use basic, spread basic() in it, or delete the file and run init again.",
          ],
          rerun: "repo-contract init --preset basic",
        }),
      )}\n`,
    )
  })

  it("exits 1 with the cause when the tiers cannot load, and writes nothing", async () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    expect(
      await init(dir, ["--preset", "app"], () => Promise.reject(new Error("no dist/tiers.js"))),
    ).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: "repo-contract init failed: no dist/tiers.js\n",
    })
    expect(existsSync(path.join(dir, "repo-contract.config.mts"))).toBe(false)
  })
})

describe("runInit: refusals before any write", () => {
  /** Runs a flat init that must fail, and checks it wrote nothing new. */
  async function refused(dir: string, cause: string) {
    // Sorted, so the comparison does not depend on the file system's order.
    const listing = (): string[][] =>
      [dir, path.join(dir, "scripts")].map((sub) =>
        existsSync(sub) && statSync(sub).isDirectory() ? readdirSync(sub).sort() : [],
      )
    const before = listing()
    expect(await init(dir, [])).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: `repo-contract init failed: ${cause}\n`,
    })
    expect(listing()).toEqual(before)
  }

  it("refuses a directory with no package.json", async () => {
    const dir = project()
    await refused(
      dir,
      `no package.json found at ${path.join(dir, "package.json")}. Run \`npm init\` first.`,
    )
  })

  it("refuses a package.json that is not JSON, quoting the parser", async () => {
    const dir = project("{")
    let parserMessage = ""
    try {
      JSON.parse("{")
    } catch (error) {
      parserMessage = (error as Error).message
    }
    await refused(
      dir,
      `package.json at ${path.join(dir, "package.json")} is not valid JSON: ${parserMessage}`,
    )
  })

  it.each([["[]"], ["null"], ["1"], ['"text"']])(
    "refuses a package.json whose top level is %s",
    async (text) => {
      const dir = project(text)
      await refused(
        dir,
        `package.json at ${path.join(dir, "package.json")} must contain a top-level object.`,
      )
    },
  )

  it("refuses a config path that is a directory", async () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    mkdirSync(path.join(dir, "repo-contract.config.mts"))
    await refused(
      dir,
      `${path.join(dir, "repo-contract.config.mts")} already exists and is a directory.`,
    )
  })

  it("refuses a scripts path that is a file", async () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    writeFileSync(path.join(dir, "scripts"), "")
    await refused(dir, `${path.join(dir, "scripts")} already exists and is not a directory.`)
  })

  it("refuses a runner path that is a directory", async () => {
    const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
    mkdirSync(path.join(dir, "scripts", "contract.mjs"), { recursive: true })
    await refused(
      dir,
      `${path.join(dir, "scripts", "contract.mjs")} already exists and is a directory.`,
    )
  })

  it("refuses a scripts field it cannot patch", async () => {
    const dir = project({ name: "p", scripts: [], devDependencies: { tsx: "^4.0.0" } })
    await refused(dir, `package.json's "scripts" field must be an object, not [].`)
  })
})

describe("runInit: a write that fails", () => {
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "exits 1 with the cause instead of reading it as a file that exists",
    async () => {
      const dir = project({ name: "p", devDependencies: { tsx: "^4.0.0" } })
      mkdirSync(path.join(dir, "scripts"))
      chmodSync(path.join(dir, "scripts"), 0o500)
      try {
        const result = await init(dir, [])
        expect(result.code).toBe(1)
        expect(result.stdout).toBe("")
        expect(result.stderr).toMatch(
          /^repo-contract init failed: EACCES: permission denied, open '.*contract\.mjs'\n$/,
        )
      } finally {
        chmodSync(path.join(dir, "scripts"), 0o700)
      }
    },
  )
})
