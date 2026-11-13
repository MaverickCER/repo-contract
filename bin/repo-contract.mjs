#!/usr/bin/env node
// The one executable this package ships. It has six commands: `init`, `affected`, `doctor`,
// `metrics`, `merge-mutation` and `cache` (`repo-contract --help` lists them).
// The amendments to specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md
// cover `init` (2026-09-09), `affected` (2026-11-01), and `cache`, `doctor` and `metrics`
// (2026-11-02).
// `init` spawns nothing and reads no environment: it reads the local package.json and writes local
// files. `metrics`, `merge-mutation` and `cache` read and write files only. `affected` and `doctor`
// must run git and read files, and `affected` also loads the project's TypeScript. So this entry
// point, and nothing else shipped, supplies those capabilities to the library (see "What `affected`
// takes from the machine" below and the 2026-11-01 amendment to
// specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
// The `AmbientCapabilities` check scans the published tarball and exempts only this entry point,
// so the library bundles under dist/ stay free of both capabilities.

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { AGENT_COMMAND, DIST_OUTPUT, detectPresets } from "./preset-catalog.mjs"
import { buildConfigTemplate, CONTRACT_RUNNER_TEMPLATE } from "./templates.mjs"
import { patchContractScript } from "./package-json-patch.mjs"

const USAGE = `Usage: repo-contract init

Scaffolds repo-contract.config.mts and scripts/contract.mjs from your package.json's declared
dependencies, and wires "scripts.contract" into package.json. That is all this command does.
Checks always run afterwards via \`npm run contract\`, never through this CLI.`

const CONTRACT_SCRIPT_VALUE = "tsx scripts/contract.mjs"

/**
 * Reads and validates the consumer's package.json at `cwd`. Throws with a message suitable for
 * printing directly (no stack trace needed) when it's missing, unparsable, or not an object:
 * every such failure is a preflight failure: nothing is written.
 * @param cwd - Directory `init` was invoked from.
 * @returns The parsed package.json content and its raw source text.
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
 * `scripts/`'s own path must not be blocked by a non-directory file. A failure here means `init`
 * performs zero writes, rather than discovering a problem partway through.
 * @param cwd - Directory `init` was invoked from.
 * @returns The absolute paths of the two scaffold targets.
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
 * Writes `content` to `filePath` if it doesn't already exist. Uses exclusive-create (`"wx"`)
 * rather than a separate existsSync check followed by a write: the two-step form has a race
 * between the check and the write; exclusive-create makes "don't overwrite an existing file"
 * atomic instead. Existing files are never touched: an existing-state conflict is handled by
 * skipping, never by overwriting.
 * @param filePath - Absolute path to write.
 * @param content - File content.
 * @returns Whether the file was created or already existed.
 */
function writeIfAbsent(filePath, content) {
  try {
    writeFileSync(filePath, content, { flag: "wx" })
    return "created"
  } catch (error) {
    if (error.code === "EEXIST") return "skipped"
    throw error
  }
}

/**
 * Whether `name` is declared in `packageJson.devDependencies`: the same devDependencies-only
 * convention `detectPresets` uses (see preset-catalog.mjs).
 * @param packageJson - Parsed package.json content.
 * @param name - Package name to look up.
 * @returns Whether it's declared.
 */
function isDevDependencyDeclared(packageJson, name) {
  return Object.hasOwn(packageJson.devDependencies ?? {}, name)
}

function runInit(cwd) {
  const { packageJsonPath, text, parsed } = readPackageJson(cwd)
  const { configPath, scriptsDir, runnerPath } = preflight(cwd)

  const { detected, skipped } = detectPresets(parsed)
  const tsxInstalled = isDevDependencyDeclared(parsed, "tsx")

  // Always compute (and, for a malformed "scripts" field, validate) the package.json patch
  // before writing anything else. A failure here must mean zero writes, never a config/runner
  // file left behind with no matching package.json change. Computing it writes nothing, so it
  // happens regardless of tsx. An existing "scripts.contract" (matching or conflicting) must
  // still be detected and reported correctly when tsx is missing. Only *writing a brand-new
  // value* is gated on tsx being installed. A generated "scripts.contract" that shells out to a
  // missing tsx would fail on its first real run.
  const patch = patchContractScript(text, CONTRACT_SCRIPT_VALUE)
  const writeNewScript = patch.status === "created" && tsxInstalled

  const configResult = writeIfAbsent(configPath, buildConfigTemplate(detected))
  if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true })
  const runnerResult = writeIfAbsent(runnerPath, CONTRACT_RUNNER_TEMPLATE)

  if (writeNewScript) {
    writeFileSync(packageJsonPath, patch.text)
  }

  const scriptStatus = patch.status === "created" && !tsxInstalled ? "tsx-missing" : patch.status
  report({ configResult, runnerResult, scriptStatus, detected, skipped })
}

function report({ configResult, runnerResult, scriptStatus, detected, skipped }) {
  const lines = ["repo-contract initialized", ""]

  const createdFiles = []
  const skippedFiles = []
  if (configResult === "created") createdFiles.push("repo-contract.config.mts")
  else skippedFiles.push("repo-contract.config.mts (already exists)")
  if (runnerResult === "created") createdFiles.push("scripts/contract.mjs")
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
      'Skipped "scripts.contract": install tsx as a devDependency, then run `repo-contract init` again.',
      "",
    )
  else
    lines.push(
      '"scripts.contract" already exists with a different value, so it was left untouched.',
      "",
    )

  lines.push("Detected:")
  for (const preset of detected) lines.push(`  ✓ ${preset}`)
  lines.push("")

  if (skipped.length > 0) {
    lines.push("Not detected (install the tool to add its check):")
    for (const { preset, dependency } of skipped)
      lines.push(
        dependency === DIST_OUTPUT
          ? `  - ${preset} (package.json names no dist/ build output)`
          : dependency === AGENT_COMMAND
            ? `  - ${preset} (runs the AI agent you name; see GUIDE.md#ai-review-checks)`
            : `  - ${preset} (${dependency} not installed)`,
      )
    lines.push("")
  }

  if (scriptStatus === "tsx-missing") {
    lines.push(
      "Next:",
      "  npm install --save-dev tsx",
      "  npx repo-contract init",
      "  npm run contract",
    )
  } else {
    lines.push("Next:", "  npm run contract")
  }

  console.log(lines.join("\n"))
}

// --- What `affected` takes from the machine: git, files and the project's own TypeScript.
// Kept in this entry point, not a module beside it, because AmbientCapabilities exempts only the
// entry points named in package.json. So this file is the one place in the package that spawns a
// process or reads the environment (specs/decisions/0011-*.md, 2026-11-01 amendment).
/** Output beyond this is an operational failure, never silently treated as "no changes". */
const MAX_BUFFER = 512 * 1024 * 1024

/**
 * The environment to run git in: a hook run from a worktree of a bare repository sets `GIT_DIR`
 * and friends, which would override the directory the caller asked about.
 * @returns {NodeJS.ProcessEnv} A copy of the environment without those variables.
 */
function gitEnvironment() {
  const env = { ...process.env }
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete env[name]
  }
  return env
}

/**
 * Builds the git and file capabilities for a repository.
 * @param {string} dir - The repository (or a directory inside it).
 * @returns {{ git: Function, readFile: Function }} The capabilities the engine needs.
 */
function createCapabilities(dir) {
  return {
    git: (args) =>
      new Promise((resolve, reject) => {
        execFile(
          "git",
          [...args],
          { cwd: dir, env: gitEnvironment(), maxBuffer: MAX_BUFFER, encoding: "utf8" },
          (error, stdout) => {
            if (error === null) {
              resolve(stdout)
            } else if (
              error.code === "ENOENT" ||
              error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
            ) {
              // git missing, or output too large: not "git said no"; the command cannot run.
              reject(error)
            } else {
              resolve(undefined)
            }
          },
        )
      }),
    readFile: (file) => readFile(path.resolve(dir, file), "utf8").catch(() => undefined),
  }
}

/**
 * Loads the TypeScript the project itself has installed.
 * @param {string} dir - The project directory.
 * @returns {Promise<object>} The `typescript` module.
 */
async function loadTypeScript(dir) {
  return createRequire(path.join(dir, "package.json"))("typescript")
}

const ROOT_USAGE = `Usage: repo-contract <command> [options]

Commands:
  repo-contract init            Scaffold repo-contract.config.mts and scripts/contract.mjs
  repo-contract affected        Show which tests and mutation targets the current changes can affect
  repo-contract merge-mutation  Combine the mutation reports of a sharded run (fails if a shard is missing)
  repo-contract metrics         Summarize the run log: pass rate, cache hits, time saved, failures by check
  repo-contract doctor          Find settings that slow or break affected-scope runs, and fix the safe ones
  repo-contract cache           Inspect and tidy the computation cache (stats, clear, prune, why)

Options:
  -h, --help     Show this help
  -V, --version  Print the version

Run 'repo-contract <command> --help' for more on a command. Checks themselves run via
\`npm run contract\`, never through this CLI.`

/**
 * Reports a usage error the conventional way: the problem and a pointer on stderr, nothing on stdout.
 * @param message - What was wrong.
 * @param pointer - The command that shows help.
 */
function usageError(message, pointer) {
  console.error(`${message}\nTry '${pointer}' for more information.`)
  process.exitCode = 2
}

async function main() {
  const [, , command, ...rest] = process.argv

  if (command === "--help" || command === "-h") {
    console.log(ROOT_USAGE)
    return
  }

  if (command === "--version" || command === "-V") {
    console.log(
      JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
    )
    return
  }

  if (command === undefined) {
    console.error(ROOT_USAGE)
    process.exitCode = 2
    return
  }

  if (command === "affected") {
    const { runAffected } = await import("./affected-cli.mjs")
    process.exitCode = await runAffected({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine: await import("../dist/affected.js"),
      createCapabilities,
      loadTypeScript,
    })
    return
  }

  if (command === "merge-mutation") {
    const { runMergeMutation } = await import("./merge-mutation-cli.mjs")
    process.exitCode = await runMergeMutation({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine: await import("../dist/affected.js"),
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
      writeFile: async (file, text) => {
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, text, "utf8")
      },
    })
    return
  }

  if (command === "metrics") {
    const { runMetrics } = await import("./metrics-cli.mjs")
    process.exitCode = await runMetrics({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine: await import("../dist/metrics.js"),
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
      now: () => new Date(),
    })
    return
  }

  if (command === "doctor") {
    const { runDoctor } = await import("./doctor-cli.mjs")
    process.exitCode = await runDoctor({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine: await import("../dist/affected.js"),
      createCapabilities: (dir) => ({
        ...createCapabilities(dir),
        writeFile: (file, text) => writeFile(path.join(dir, file), text, "utf8"),
      }),
    })
    return
  }

  if (command === "cache") {
    const { runCache } = await import("./cache-cli.mjs")
    const [engine, helpers] = await Promise.all([
      import("../dist/affected.js"),
      import("../dist/helpers.js"),
    ])
    process.exitCode = await runCache({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine,
      createStore: helpers.createFileCacheStore,
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
      now: () => new Date(),
    })
    return
  }

  if (command !== "init") {
    usageError(`repo-contract: unknown command '${command}'`, "repo-contract --help")
    return
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(USAGE)
    return
  }

  if (rest.length > 0) {
    usageError(
      `repo-contract init takes no arguments (got: ${rest.join(" ")})`,
      "repo-contract init --help",
    )
    return
  }

  try {
    runInit(process.cwd())
  } catch (error) {
    console.error(`repo-contract init failed: ${error.message}`)
    process.exitCode = 1
  }
}

await main()
