// `repo-contract init`: scaffold repo-contract.config.mts and scripts/contract.mjs, and wire
// "scripts.contract" into package.json. It spawns nothing and reads no environment: it reads the
// local package.json and writes local files. argv, stdout, stderr and the tier catalog are
// injected, so unit tests call it in-process; bin/repo-contract.mjs wires the production ones.
// Exit status: 0 when it ran, 1 when it could not, 2 for a usage error.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  AGENT_COMMAND,
  DIST_OUTPUT,
  PUBLISHED_PACKAGE,
  NPM_LOCKFILE,
  QUICK_START_BLOCK,
  NPM_SCRIPT,
  TIER_ONLY_PRESETS,
  TIER_PRESET_NAMES,
  detectPresets,
  missingTierTools,
} from "./preset-catalog.mjs"
import {
  buildConfigTemplate,
  buildTierConfigTemplate,
  CONTRACT_RUNNER_TEMPLATE,
  tierInitHeadline,
} from "./templates.mjs"
import { patchContractScript } from "./package-json-patch.mjs"

export const INIT_USAGE = `Usage: repo-contract init [--preset <tier>]

Scaffolds repo-contract.config.mts and scripts/contract.mjs, and wires "scripts.contract" into
package.json. That is all this command does: it writes no workflow and never overwrites a file.
Checks always run afterwards via \`npm run contract\`, never through this CLI.

Without --preset, the config lists one preset per tool your package.json declares as a
devDependency. coverage, crap and mutation are left to the tiers, which order them.

Options:
  --preset <tier>  Spread one tier instead: basic, app, library or strict. The output names each
                   tool the tier runs that package.json does not declare.
  -h, --help       Show this help`

const CONTRACT_SCRIPT_VALUE = "tsx scripts/contract.mjs"

/**
 * Reads and validates the consumer's package.json at `cwd`. It throws when the file is missing,
 * unparsable, or not an object, with a message meant for printing without a stack trace. Each
 * such failure is a preflight failure, so nothing is written.
 * @param {string} cwd - Directory `init` was invoked from.
 * @returns {{ packageJsonPath: string, text: string, parsed: Record<string, any> }} The parsed
 * package.json content and its raw source text.
 */
function readPackageJson(cwd) {
  const packageJsonPath = path.join(cwd, "package.json")
  if (!existsSync(packageJsonPath)) {
    throw new Error(`no package.json found at ${packageJsonPath}. Run \`npm init\` first.`)
  }
  const text = readFileSync(packageJsonPath, "utf8")
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`package.json at ${packageJsonPath} is not valid JSON: ${error.message}`)
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`package.json at ${packageJsonPath} must contain a top-level object.`)
  }
  return { packageJsonPath, text, parsed }
}

/**
 * Preflight-checks the two scaffold targets: neither may already exist as a directory, and
 * `scripts/`'s path must not be blocked by a non-directory file. A failure here means `init`
 * performs zero writes, rather than discovering a problem partway through.
 * @param {string} cwd - Directory `init` was invoked from.
 * @returns {{ configPath: string, scriptsDir: string, runnerPath: string }} The absolute paths of
 * the two scaffold targets.
 */
function preflight(cwd) {
  const configPath = path.join(cwd, "repo-contract.config.mts")
  const scriptsDir = path.join(cwd, "scripts")
  const runnerPath = path.join(scriptsDir, "contract.mjs")

  if (existsSync(configPath) && statSync(configPath).isDirectory()) {
    throw new Error(`${configPath} already exists and is a directory.`)
  }
  if (existsSync(scriptsDir) && !statSync(scriptsDir).isDirectory()) {
    throw new Error(`${scriptsDir} already exists and is not a directory.`)
  }
  if (existsSync(runnerPath) && statSync(runnerPath).isDirectory()) {
    throw new Error(`${runnerPath} already exists and is a directory.`)
  }

  return { configPath, scriptsDir, runnerPath }
}

/**
 * Writes `content` to `filePath` if it doesn't already exist. It uses exclusive-create (`"wx"`),
 * not an existsSync check followed by a write. The two-step form races between the check and the
 * write. Exclusive-create makes "don't overwrite an existing file" atomic. An existing file is
 * skipped, never overwritten.
 * @param {string} filePath - Absolute path to write.
 * @param {string} content - File content.
 * @returns {boolean} Whether the file was created; `false` when it already existed.
 */
function writeIfAbsent(filePath, content) {
  try {
    writeFileSync(filePath, content, { flag: "wx" })
    return true
  } catch (error) {
    if (error.code === "EEXIST") return false
    throw error
  }
}

/**
 * Parses the arguments after `init`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {{ kind: "help" } | { kind: "error", message: string } | { kind: "run", tier?: string }} What to do.
 */
export function parseInitArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" }
  let tier
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const equals = arg.startsWith("--preset=")
    if (arg !== "--preset" && !equals) {
      return { kind: "error", message: `unknown option '${arg}'` }
    }
    const value = equals ? arg.slice("--preset=".length) : argv[index + 1]
    if (value === undefined || value === "" || value.startsWith("-")) {
      return { kind: "error", message: "option '--preset' needs a value" }
    }
    if (!equals) index += 1
    if (tier !== undefined) return { kind: "error", message: "give --preset only once" }
    if (!TIER_PRESET_NAMES.includes(value)) {
      return {
        kind: "error",
        message: `'${value}' is not a tier: choose ${TIER_PRESET_NAMES.join(", ")}`,
      }
    }
    tier = value
  }
  return { kind: "run", tier }
}

/**
 * Why `init` left a preset out, as its "Not detected" line says it.
 * @param {string} preset - The preset left out.
 * @param {string | readonly string[]} dependency - The preset's PRESET_DEPENDENCIES value.
 * @returns {string} The reason.
 */
function skipReason(preset, dependency) {
  if (TIER_ONLY_PRESETS.has(preset)) {
    const tier = preset === "coverage" ? "app" : "strict"
    return `a tier orders it after the tests; use \`repo-contract init --preset ${tier}\``
  }
  if (dependency === DIST_OUTPUT) return "package.json names no dist/ build output"
  if (dependency === AGENT_COMMAND)
    return "runs the AI agent you name; see GUIDE.md#ai-review-checks"
  if (dependency === PUBLISHED_PACKAGE) return "package.json is private, so npm never publishes it"
  if (dependency === QUICK_START_BLOCK)
    return "runs the README block you mark; see GUIDE.md#presets"
  if (dependency === NPM_LOCKFILE)
    return "checks SBOM documents you write and commit first; see GUIDE.md#keep-an-sbom-current"
  if (dependency === NPM_SCRIPT) return "runs the npm script you name; see GUIDE.md#presets"
  return `${dependency} not installed`
}

/**
 * Renders what `init` did, as it prints it.
 * @param {object} outcome - What `init` did.
 * @param {boolean} outcome.configCreated - Whether the config was written.
 * @param {boolean} outcome.runnerCreated - Whether the runner was written.
 * @param {string} outcome.scriptStatus - `created`, `unchanged`, `conflict` or `tsx-missing`.
 * @param {readonly string[]} outcome.detected - The presets a flat config lists.
 * @param {readonly { preset: string, dependency: string | readonly string[] }[]} outcome.skipped -
 * The presets a flat config leaves out.
 * @param {boolean} outcome.flat - Whether `init` ran without `--preset`.
 * @param {readonly string[]} outcome.headline - The opening lines.
 * @param {{ name: string, checks: readonly string[], missing: readonly { check: string, dependency: string }[] } | undefined} outcome.tier -
 * The tier the config on disk spreads, its checks, and its tools package.json does not declare.
 * @param {string} outcome.rerun - The command line that runs `init` again.
 * @returns {string} The report, without a final newline.
 */
export function renderInitReport({
  configCreated,
  runnerCreated,
  scriptStatus,
  detected,
  skipped,
  flat,
  headline,
  tier,
  rerun,
}) {
  const lines = [...headline, ""]

  const createdFiles = []
  const skippedFiles = []
  if (configCreated) createdFiles.push("repo-contract.config.mts")
  else skippedFiles.push("repo-contract.config.mts (already exists)")
  if (runnerCreated) createdFiles.push("scripts/contract.mjs")
  else skippedFiles.push("scripts/contract.mjs (already exists)")

  if (createdFiles.length > 0) {
    lines.push("Created:")
    for (const file of createdFiles) lines.push(`  ✓ ${file}`)
    lines.push("")
  }
  if (skippedFiles.length > 0) {
    lines.push("Skipped:")
    for (const file of skippedFiles) lines.push(`  - ${file}`)
    lines.push("")
  }

  if (scriptStatus === "created") lines.push('Added "scripts.contract" to package.json.', "")
  else if (scriptStatus === "unchanged")
    lines.push('"scripts.contract" already set to this value.', "")
  else if (scriptStatus === "tsx-missing")
    lines.push(
      `Skipped "scripts.contract": install tsx as a devDependency, then run \`${rerun}\` again.`,
      "",
    )
  else
    lines.push(
      '"scripts.contract" already exists with a different value, so it was left untouched.',
      "",
    )

  if (flat) {
    lines.push("Detected:")
    for (const preset of detected) lines.push(`  ✓ ${preset}`)
    lines.push("")

    if (skipped.length > 0) {
      lines.push("Not detected (install the tool to add its check):")
      for (const { preset, dependency } of skipped)
        lines.push(`  - ${preset} (${skipReason(preset, dependency)})`)
      lines.push("")
    }
  } else if (tier !== undefined) {
    lines.push(
      `Tier ${tier.name} runs ${tier.checks.length} checks: ${tier.checks.join(", ")}.`,
      "",
    )
    if (tier.missing.length > 0) {
      lines.push(
        `Not installed (add each as a devDependency, or turn its check off with ${tier.name}({ <Check>: false })):`,
      )
      for (const { check, dependency } of tier.missing)
        lines.push(`  - ${check} needs ${dependency}`)
      lines.push("")
    }
  }

  if (scriptStatus === "tsx-missing") {
    lines.push("Next:", "  npm install --save-dev tsx", `  npx ${rerun}`)
    if (!flat) lines.push("  npx repo-contract explain")
    lines.push("  npm run contract")
  } else if (!flat) {
    lines.push("Next:", "  npx repo-contract explain", "  npm run contract")
  } else {
    lines.push("Next:", "  npm run contract")
  }

  return lines.join("\n")
}

/**
 * Writes the scaffold and works out what to report.
 * @param {string} cwd - Directory `init` was invoked from.
 * @param {{ name: string, checksOf: (name: string) => readonly string[] } | undefined} tier - The
 * tier to spread, and how to list a tier's check ids; `undefined` for the flat, detected config.
 * @param {readonly string[]} argv - The arguments after `init`, valid by now. The rerun hint
 * repeats them, so a missing tsx never costs the user their `--preset`.
 * @returns {Parameters<typeof renderInitReport>[0]} What `init` did.
 */
function scaffold(cwd, tier, argv) {
  const { packageJsonPath, text, parsed } = readPackageJson(cwd)
  const { configPath, scriptsDir, runnerPath } = preflight(cwd)

  const { detected, skipped } = detectPresets(parsed)
  // The same devDependencies-only convention `detectPresets` uses (see preset-catalog.mjs).
  const tsxInstalled = Object.hasOwn(parsed.devDependencies ?? {}, "tsx")

  // Always compute (and, for a malformed "scripts" field, validate) the package.json patch
  // before writing anything else. A failure here must mean zero writes, never a config/runner
  // file left behind with no matching package.json change. Computing it writes nothing, so it
  // happens regardless of tsx. An existing "scripts.contract" (matching or conflicting) must
  // still be detected and reported correctly when tsx is missing. Only *writing a brand-new
  // value* is gated on tsx being installed. A generated "scripts.contract" that shells out to a
  // missing tsx would fail on its first run.
  const patch = patchContractScript(text, CONTRACT_SCRIPT_VALUE)
  const writeNewScript = patch.status === "created" && tsxInstalled

  const configCreated = writeIfAbsent(
    configPath,
    tier === undefined ? buildConfigTemplate(detected) : buildTierConfigTemplate(tier.name),
  )
  // preflight() has ruled out a file at scripts/, and a recursive mkdir accepts an existing directory.
  mkdirSync(scriptsDir, { recursive: true })
  const runnerCreated = writeIfAbsent(runnerPath, CONTRACT_RUNNER_TEMPLATE)

  if (writeNewScript) {
    writeFileSync(packageJsonPath, patch.text)
  }

  const scriptStatus = patch.status === "created" && !tsxInstalled ? "tsx-missing" : patch.status
  // A kept config is described by the tier it spreads, which may not be the one asked for.
  const headline =
    tier === undefined
      ? { lines: ["repo-contract initialized"], tier: undefined }
      : tierInitHeadline(tier.name, configCreated ? undefined : readFileSync(configPath, "utf8"))
  const checks = headline.tier === undefined ? undefined : tier.checksOf(headline.tier)
  return {
    configCreated,
    runnerCreated,
    scriptStatus,
    detected,
    skipped,
    flat: tier === undefined,
    headline: headline.lines,
    tier:
      checks === undefined
        ? undefined
        : { name: headline.tier, checks, missing: missingTierTools(checks, parsed) },
    rerun: ["repo-contract", "init", ...argv].join(" "),
  }
}

/**
 * Runs `repo-contract init`.
 * @param {object} input - Everything the command takes, injected.
 * @param {readonly string[]} input.argv - The arguments after `init`.
 * @param {string} input.cwd - The project directory.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {() => Promise<{ tierChecks: (name: string) => readonly string[] }>} input.loadTiers -
 * Loads repo-contract/tiers; called only with `--preset`.
 * @returns {Promise<number>} The exit status.
 */
export async function runInit(input) {
  const parsed = parseInitArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${INIT_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract init: ${parsed.message}\nTry 'repo-contract init --help' for more information.\n`,
    )
    return 2
  }

  try {
    let tier
    if (parsed.tier !== undefined) {
      const { tierChecks } = await input.loadTiers()
      tier = { name: parsed.tier, checksOf: tierChecks }
    }
    input.stdout(`${renderInitReport(scaffold(input.cwd, tier, input.argv))}\n`)
    return 0
  } catch (error) {
    input.stderr(`repo-contract init failed: ${error.message}\n`)
    return 1
  }
}
