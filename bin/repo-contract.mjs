#!/usr/bin/env node
// The one published executable surface this package ships -- scaffolding only, per
// specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md's 2026-09-09
// amendment. It recognizes exactly one subcommand, `init`; every other invocation prints usage
// and exits non-zero. `init` performs zero process spawning and zero reads of the ambient
// environment -- it only reads the consumer's local package.json (via node:fs) and writes local
// files, extending specs/decisions/0011-process-spawning-and-ambient-environment-access-are-
// consumer-supplied-capabilities-not-package-owned.md's invariant to this surface. This file is
// scanned by scripts/verify-no-ambient-capabilities.mjs against the real published tarball, so it
// deliberately never spells out the literal two-word token that scanner forbids -- not even in a
// comment explaining why -- and never imports child_process/cross-spawn.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { detectPresets } from "./preset-catalog.mjs"
import { buildConfigTemplate, CONTRACT_RUNNER_TEMPLATE } from "./templates.mjs"
import { patchContractScript } from "./package-json-patch.mjs"

const USAGE = `Usage: repo-contract init

Scaffolds repo-contract.config.mts and scripts/contract.mjs from your package.json's declared
dependencies, and wires "scripts.contract" into package.json. That's the only thing this command
does -- checks always run afterwards via \`npm run contract\`, never through this CLI.`

const CONTRACT_SCRIPT_VALUE = "tsx scripts/contract.mjs"

/**
 * Reads and validates the consumer's package.json at `cwd`. Throws with a message suitable for
 * printing directly (no stack trace needed) when it's missing, unparsable, or not an object --
 * every such failure is a preflight failure: nothing is written.
 * @param cwd - Directory `init` was invoked from.
 * @returns The parsed package.json content and its raw source text.
 */
function readPackageJson(cwd) {
  const packageJsonPath = path.join(cwd, "package.json")
  if (!existsSync(packageJsonPath)) {
    throw new Error(`no package.json found at ${packageJsonPath} -- run \`npm init\` first.`)
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
 * rather than a separate existsSync check followed by a write -- the two-step form has a race
 * between the check and the write; exclusive-create makes "don't overwrite an existing file"
 * atomic instead. Existing files are never touched -- an existing-state conflict is handled by
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
 * Whether `name` is declared in `packageJson.devDependencies` -- the same devDependencies-only
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
  // before writing anything else -- a failure here must mean zero writes, never a config/runner
  // file left behind with no matching package.json change. Computing it doesn't write anything
  // by itself, so this happens regardless of tsx: an existing "scripts.contract" -- matching or
  // conflicting -- must still be detected and reported correctly even when tsx is missing. Only
  // *writing a brand-new value* is gated on tsx being installed: a generated "scripts.contract"
  // that shells out to a missing tsx would fail on its first real run.
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
      'Skipped "scripts.contract" -- install tsx as a devDependency, then run `repo-contract init` again.',
      "",
    )
  else lines.push('"scripts.contract" already exists with a different value -- left untouched.', "")

  lines.push("Detected:")
  for (const preset of detected) lines.push(`  ✓ ${preset}`)
  lines.push("")

  if (skipped.length > 0) {
    lines.push("Not detected (install the tool to add its check):")
    for (const { preset, dependency } of skipped)
      lines.push(`  - ${preset} (${dependency} not installed)`)
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

function main() {
  const [, , command, ...rest] = process.argv

  if (command === "--help" || command === "-h") {
    console.log(USAGE)
    process.exitCode = 0
    return
  }

  if (command !== "init") {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  if (rest.length > 0) {
    console.error(`repo-contract init takes no arguments (got: ${rest.join(" ")})\n\n${USAGE}`)
    process.exitCode = 1
    return
  }

  try {
    runInit(process.cwd())
  } catch (error) {
    console.error(`repo-contract init failed: ${error.message}`)
    process.exitCode = 1
  }
}

main()
