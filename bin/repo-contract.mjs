#!/usr/bin/env node
// The one executable this package ships. It has twelve commands: `init`, `affected`, `doctor`,
// `metrics`, `merge-mutation`, `cache`, `quick-start`, `explain`, `except`, `exceptions`,
// `mutation` and `npm-script` (`repo-contract --help` lists them). The amendments to
// specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md cover `init`
// (2026-09-09), `affected` (2026-11-01), `cache`, `doctor` and `metrics` (2026-11-02),
// `quick-start` (2026-11-15), and the rest with `init --preset` (2026-11-16).
// `init` spawns nothing and reads no environment: it reads the local package.json and writes local
// files. `metrics`, `merge-mutation`, `cache`, `except` and `exceptions` read and write files only.
// `explain` loads the project's config through the project's tsx and starts no check. `affected`
// and `doctor` must run git and read files, and `affected` also loads the project's TypeScript.
// `quick-start` runs npm and the README's commands, `npm-script` runs one npm script, and
// `mutation run` runs Stryker (and git, with the cache on). This entry point is the only shipped
// code that supplies them (see "What `affected` takes from the machine" below and the amendments
// to specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
// The `AmbientCapabilities` check scans the published tarball and exempts only this entry point,
// so the library bundles under dist/ stay free of both capabilities.

import { execFile, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { checkDirectory } from "./cli-options.mjs"
import { outputTail, stopProcessGroup } from "./npm-script-cli.mjs"

// --- What `affected` takes from the machine: git, files and the project's TypeScript.
// Kept in this entry point, not a module beside it, because AmbientCapabilities exempts only the
// entry points named in package.json. So this file is the one place in the package that spawns a
// process or reads the environment (specs/decisions/0011-*.md, 2026-11-01 amendment).
/** Output beyond this is an operational failure, never silently treated as "no changes". */
const MAX_BUFFER = 512 * 1024 * 1024

/**
 * The environment to run git in. A hook run from a worktree of a bare repository sets `GIT_DIR`
 * and related variables. They would override the directory the caller asked about.
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

// --- What `quick-start` takes from the machine: npm, and a shell for the README's commands.
const IS_WINDOWS = process.platform === "win32"

/**
 * The environment the quick start runs in. `npm run` sets variables that describe the package
 * being run, such as its directory; a nested npm in the empty project must not read them.
 * @returns {NodeJS.ProcessEnv} A copy of the environment without them.
 */
function quickStartEnvironment() {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (
      /^(npm_package_|npm_lifecycle_|npm_config_local_prefix$|npm_command$|INIT_CWD$)/i.test(name)
    ) {
      delete env[name]
    }
  }
  return env
}

/**
 * Starts a process and collects its exit and output. On Windows `npm` is a `.cmd` file that only
 * a shell can start, so arguments with spaces are quoted for it.
 * @param {string} command - The program.
 * @param {readonly string[]} args - Its arguments.
 * @param {{ cwd: string }} options - Where to run it.
 * @returns {Promise<{ exitCode: number | null, stdout: string, stderr: string }>} The result.
 */
function execCapability(command, args, { cwd }) {
  return new Promise((resolve) => {
    const quoted = IS_WINDOWS ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args
    const child = spawn(command, quoted, { cwd, env: quickStartEnvironment(), shell: IS_WINDOWS })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", (error) =>
      resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}` }),
    )
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

/**
 * Runs one command line in the platform shell, and stops it, with every process it started, once
 * `timeoutMs` passes. On POSIX the shell leads its own process group, so one signal reaches all.
 * @param {string} command - The command line.
 * @param {{ cwd: string, timeoutMs: number }} options - Where to run it, and for how long.
 * @returns {Promise<{ exitCode: number | null, timedOut: boolean, output: string }>} The result.
 */
function shellCapability(command, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      env: quickStartEnvironment(),
      shell: true,
      detached: !IS_WINDOWS,
      stdio: ["ignore", "pipe", "pipe"],
    })
    // One tail for both streams, as the report shows them interleaved. A flood cannot fill memory.
    const output = outputTail()
    let timedOut = false
    child.stdout.setEncoding("utf8").on("data", output.push)
    child.stderr.setEncoding("utf8").on("data", output.push)
    const timer = setTimeout(() => {
      timedOut = true
      if (IS_WINDOWS) execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {})
      else stopProcessGroup((pid, signal) => process.kill(pid, signal), child.pid)
    }, timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ exitCode: null, timedOut, output: `${output.text()}${error.message}` })
    })
    // A stopped run has no exit code on any platform. taskkill /F would otherwise report 1.
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      resolve({ exitCode: timedOut ? null : exitCode, timedOut, output: output.text() })
    })
  })
}

const ROOT_USAGE = `Usage: repo-contract <command> [options]

Commands:
  repo-contract init            Scaffold repo-contract.config.mts and scripts/contract.mjs
  repo-contract affected        Show which tests and mutation targets the current changes can affect
  repo-contract merge-mutation  Combine the mutation reports of a sharded run (fails if a shard is missing)
  repo-contract metrics         Summarize the run log: pass rate, cache hits, time saved, failures by check
  repo-contract doctor          Find settings that slow or break affected-scope runs, and fix the safe ones
  repo-contract cache           Inspect and tidy the computation cache (stats, clear, prune, why)
  repo-contract quick-start     Run the README's marked quick start against the packed tarball
  repo-contract explain         Show what the config runs and every setting looser than its tier
  repo-contract except <id>     Fill in one exception record and list what it still lacks
  repo-contract exceptions      Count the exception records by registry and type
  repo-contract mutation        Plan a sharded mutation run, or run Stryker for the mutation check
  repo-contract npm-script      Run one npm script for the npmScript check

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
      checkDirectory,
      createCapabilities,
      loadTypeScript,
    })
    return
  }

  if (command === "quick-start") {
    const { runQuickStart } = await import("./quick-start-cli.mjs")
    process.exitCode = await runQuickStart({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      exec: execCapability,
      shell: shellCapability,
      now: () => Date.now(),
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
      checkDirectory,
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
      checkDirectory,
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
      checkDirectory,
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
      checkDirectory,
      createStore: helpers.createFileCacheStore,
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
      now: () => new Date(),
    })
    return
  }

  if (command === "explain") {
    const { runExplain } = await import("./explain-cli.mjs")
    process.exitCode = await runExplain({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      engine: await import("../dist/tiers.js"),
      createRequire,
    })
    return
  }

  if (command === "except") {
    const { runExcept } = await import("./except-cli.mjs")
    const [helpers, affected] = await Promise.all([
      import("../dist/helpers.js"),
      import("../dist/affected.js"),
    ])
    process.exitCode = await runExcept({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      helpers,
      affected,
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
      mkdir: (dir) => mkdir(dir, { recursive: true }),
    })
    return
  }

  if (command === "exceptions") {
    const { runExceptions } = await import("./exceptions-cli.mjs")
    process.exitCode = await runExceptions({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      helpers: await import("../dist/helpers.js"),
      now: () => new Date(),
    })
    return
  }

  if (command === "mutation") {
    const { runMutation } = await import("./mutation-cli.mjs")
    const [affected, helpers] = await Promise.all([
      import("../dist/affected.js"),
      import("../dist/helpers.js"),
    ])
    process.exitCode = await runMutation({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      affected,
      helpers,
      // Stryker's own output goes to stderr, so stdout carries only the report. A re-run of one
      // timed-out mutant is quiet: its log would bury the full run's.
      stryker: (args, { cwd, quiet }) =>
        new Promise((resolve) => {
          const quoted = IS_WINDOWS ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args
          const sink = quiet ? "ignore" : 2
          const child = spawn("stryker", quoted, {
            cwd,
            shell: IS_WINDOWS,
            stdio: ["ignore", sink, sink],
          })
          child.on("error", (error) => resolve({ exitCode: null, error: error.message }))
          child.on("close", (exitCode) => resolve({ exitCode }))
        }),
      git: (args, dir) => createCapabilities(dir).git(args),
      now: () => new Date(),
    })
    return
  }

  if (command === "npm-script") {
    const { runNpmScript } = await import("./npm-script-cli.mjs")
    // Argv-only on POSIX, so the script name never meets a shell. A POSIX child leads its own
    // process group, so a timeout stops npm and the script it started together. Each stream
    // keeps only its tail, so a script that floods its output cannot exhaust memory.
    const exec = (program, args, { cwd, timeoutMs }) =>
      new Promise((resolve) => {
        const child = spawn(program, args, {
          cwd,
          env: quickStartEnvironment(),
          shell: IS_WINDOWS,
          detached: !IS_WINDOWS,
          stdio: ["ignore", "pipe", "pipe"],
        })
        const stdout = outputTail()
        const stderr = outputTail()
        let timedOut = false
        child.stdout.setEncoding("utf8").on("data", stdout.push)
        child.stderr.setEncoding("utf8").on("data", stderr.push)
        const timer =
          timeoutMs === undefined
            ? undefined
            : setTimeout(() => {
                timedOut = true
                if (IS_WINDOWS)
                  execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {})
                else stopProcessGroup((pid, signal) => process.kill(pid, signal), child.pid)
              }, timeoutMs)
        child.on("error", (error) => {
          clearTimeout(timer)
          resolve({
            exitCode: null,
            timedOut,
            stdout: stdout.text(),
            stderr: `${stderr.text()}${error.message}`,
          })
        })
        // A stopped run has no exit code on any platform. taskkill /F would otherwise report 1.
        child.on("close", (exitCode) => {
          clearTimeout(timer)
          resolve({
            exitCode: timedOut ? null : exitCode,
            timedOut,
            stdout: stdout.text(),
            stderr: stderr.text(),
          })
        })
      })
    process.exitCode = await runNpmScript({
      argv: rest,
      cwd: process.cwd(),
      version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      exec,
    })
    return
  }

  if (command === "init") {
    const { runInit } = await import("./init-cli.mjs")
    process.exitCode = await runInit({
      argv: rest,
      cwd: process.cwd(),
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      loadTiers: () => import("../dist/tiers.js"),
    })
    return
  }

  usageError(`repo-contract: unknown command '${command}'`, "repo-contract --help")
}

await main()
