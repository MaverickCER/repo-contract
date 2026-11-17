// `repo-contract mutation plan|run`: plan a sharded mutation run, or run Stryker and print the
// report the `mutation` preset judges. Starting processes is injected (`stryker` and `git`),
// because only bin/repo-contract.mjs may reach a process spawner. This file reads and writes files
// itself. Data goes to stdout and Stryker's own output to stderr. `plan` exits 0 or 1. `run` exits
// with Stryker's code, 0 for a reused, adopted or empty run, and 1 when the run could not start.
// A usage error exits 2.
//
// Every run is cold. A result Stryker carries over from an incremental file may come from other
// code, another concurrency or a loaded machine. A local gate would then pass what CI fails. So
// the incremental file and the previous report are deleted first, and Stryker gets `--force`.
//
// The run deletes Stryker's `tempDirName`, incremental file and report. It refuses any of them
// that resolves outside the project, symbolic links included.
//
// This file parses the arguments and runs the steps. mutation-plan.mjs reads the config and plans
// shards, mutation-adopt.mjs judges a report made elsewhere, and mutation-cache.mjs keys the cache.

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { checkDirectory, commandDirectory } from "./cli-options.mjs"
import { CACHE_CHECK, CACHE_DIRECTORY, cacheInputs, isClean } from "./mutation-cache.mjs"
import { adoptionProblem, mutantFreeFiles, STATUSES } from "./mutation-adopt.mjs"
import { loadStrykerConfig, runPlan, sized, targetsOf } from "./mutation-plan.mjs"
import {
  ancestorsOf,
  ensureStrykerVitest5Compat,
  isStrictlyInside,
} from "./stryker-vitest5-compat.mjs"

export const MUTATION_USAGE = `Usage: repo-contract mutation <plan|run> [options]

Plans a sharded mutation run, or runs Stryker for the mutation check. A run is always cold: it
deletes Stryker's incremental file and passes --force, so every mutant is tested again.

  repo-contract mutation plan [--config <file>] [--json] [-C <dir>]
  repo-contract mutation run [--json] [--shard <i>/<n>] [--mutate <file>[,<file>...]]
                             [--report <file>] [--config <file>]
                             [--cache read-write|read-only|off] [--confirm-timeouts <n>]
                             [--no-patch-vitest-runner] [-C <dir>]

plan prints how many shards the Stryker config's mutate set needs: one per 64 KiB of source.

run options:
  --shard <i>/<n>          Mutate slice i of n, cut by file size as 'plan' cuts it
  --mutate <files>         Mutate only these files; --mutate= mutates nothing and passes
  --report <file>          Judge this report and mutate nothing, after checking that it was
                           made from this checkout's plan (a merged sharded run)
  --cache <mode>           Reuse a clean run while nothing it depends on has changed
                           (default: off; the cache lives in .repo-contract/cache)
  --confirm-timeouts <n>   Re-run at most n timed-out mutants alone before a timeout counts
                           (default: 5; more timeouts than n are left as they are)
  --no-patch-vitest-runner Leave node_modules/@stryker-mutator/vitest-runner as installed. By
                           default, on Vitest 5 a runner inside the project without the
                           stryker-js#6210 fix gets its test-name separator patched, or every
                           mutant runs 0 tests. One outside the project is never patched

Common options:
  --config <file>  The Stryker config (default: the first stryker.config.* or stryker.conf.*)
  --json           Print a machine-readable report (schemaVersion 1)
  -C <dir>         Run as if started in <dir>
  -h, --help       Show this help
  -V, --version    Print the version

Exit status: plan 0, or 1 when the config cannot be read or selects no file. run: Stryker's exit
code when it ran; 0 when it reused, adopted or had nothing to mutate; 1 when it could not run.
2 for a usage error.`

const CACHE_MODES = new Set(["read-write", "read-only", "off"])

/** What a re-run says about a timed-out mutant it caught. */
export const CAUGHT_ALONE = "timed out in the full run and was caught when run alone"

const SHARD = /^([1-9]\d*)\/([1-9]\d*)$/

const NO_PATCH = "--no-patch-vitest-runner"

const VALUE_OPTIONS = {
  plan: new Set(["--config", "-C"]),
  run: new Set([
    "--shard",
    "--mutate",
    "--report",
    "--config",
    "--cache",
    "--confirm-timeouts",
    "-C",
  ]),
}

/**
 * Checks one option's value and stores it.
 * @param {Record<string, unknown>} options - The options so far; changed in place.
 * @param {string} name - The option.
 * @param {string} value - Its value.
 * @returns {string | undefined} A usage error, or `undefined`.
 */
function setOption(options, name, value) {
  if (name === "--shard") {
    const match = SHARD.exec(value)
    if (match === null || Number(match[1]) > Number(match[2])) {
      return "option '--shard' needs <index>/<total> with 1 <= index <= total"
    }
    options.shard = value
  } else if (name === "--mutate") {
    options.mutate = value === "" ? [] : value.split(",")
  } else if (name === "--cache") {
    if (!CACHE_MODES.has(value)) return "option '--cache' needs read-write, read-only or off"
    options.cache = value
  } else if (name === "--confirm-timeouts") {
    if (!/^\d+$/.test(value)) return "option '--confirm-timeouts' needs a whole number"
    options.confirmTimeouts = Number(value)
  } else if (name === "-C") {
    options.cwd = value
  } else {
    options[name.slice(2)] = value
  }
  return undefined
}

/**
 * Parses the arguments after `mutation`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the subcommand and its options.
 */
export function parseMutationArgs(argv) {
  if (argv.some((arg) => arg === "--help" || arg === "-h")) return { kind: "help" }
  if (argv.some((arg) => arg === "--version" || arg === "-V")) return { kind: "version" }
  const [kind, ...rest] = argv
  if (kind === undefined) return { kind: "error", message: "a subcommand is required: plan or run" }
  if (kind !== "plan" && kind !== "run") {
    return { kind: "error", message: `unknown subcommand '${kind}': use plan or run` }
  }
  const options =
    kind === "plan"
      ? { json: false }
      : { json: false, cache: "off", confirmTimeouts: 5, patchVitestRunner: true }
  // A `for...of` over the entries cannot loop forever, whatever the body does to its position.
  let valueTaken = false
  for (const [index, arg] of rest.entries()) {
    if (valueTaken) {
      valueTaken = false
      continue
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (name === "--json") {
      if (equals !== -1) return { kind: "error", message: "option '--json' does not take a value" }
      options.json = true
      continue
    }
    if (name === NO_PATCH && kind === "run") {
      if (equals !== -1)
        return { kind: "error", message: `option '${NO_PATCH}' does not take a value` }
      options.patchVitestRunner = false
      continue
    }
    if (!VALUE_OPTIONS[kind].has(name)) {
      return {
        kind: "error",
        message: arg.startsWith("-") ? `unknown option '${arg}'` : `unexpected argument '${arg}'`,
      }
    }
    const value = equals === -1 ? rest[index + 1] : arg.slice(equals + 1)
    // Only `--mutate=` may be empty: it is how an empty list is written.
    const emptyAllowed = name === "--mutate" && equals !== -1
    if (value === undefined || (value === "" && !emptyAllowed) || value.startsWith("-")) {
      return { kind: "error", message: `option '${name}' needs a value` }
    }
    valueTaken = equals === -1
    const problem = setOption(options, name, value)
    if (problem !== undefined) return { kind: "error", message: problem }
  }
  if (options.report !== undefined && options.shard !== undefined) {
    return { kind: "error", message: "options '--report' and '--shard' cannot be used together" }
  }
  return { kind, options }
}

/**
 * @param {string} file - A report.
 * @returns {any} The parsed report, or `undefined` when it is missing or not JSON.
 */
function readReport(file) {
  try {
    return JSON.parse(String(readFileSync(file)))
  } catch {
    // A missing or unparsable report reads as no report.
  }
  return undefined
}

/**
 * @param {any} mutant - A timed-out mutant of the full run, which has a location.
 * @param {any} other - A mutant of a re-run.
 * @returns {boolean} Whether they are the same mutation of the same code.
 */
function sameMutant(mutant, other) {
  const { mutatorName, replacement, location } = other ?? {}
  return (
    mutant.mutatorName === mutatorName &&
    mutant.replacement === replacement &&
    mutant.location.start.line === location?.start?.line &&
    // Equal lines mean the re-run's mutant has a start.
    mutant.location.start.column === location.start.column
  )
}

/**
 * Runs each timed-out mutant again, alone, at concurrency 1. A machine that swaps or pauses can
 * stall one test run for minutes, and Stryker then reports that mutant as a timeout; alone, it is
 * caught. One that times out again stays a timeout. More than `limit` timeouts is a broken run,
 * and it is left as it is.
 * @param {object} run - What the re-runs need.
 * @param {string} run.cwd - The project.
 * @param {string} run.reportFile - Where Stryker writes its report.
 * @param {string} run.config - The config file.
 * @param {number} run.limit - The most timeouts to re-run.
 * @param {(args: string[], options: object) => Promise<{ exitCode: number | null }>} run.stryker - Runs Stryker.
 * @returns {Promise<{ rerun: number, caught: number }>} How many were re-run and caught.
 */
async function confirmTimeouts({ cwd, reportFile, config, limit, stryker }) {
  const report = readReport(reportFile)
  const timedOut = Object.entries(report?.files ?? {})
    .filter(([, entry]) => Array.isArray(entry?.mutants))
    .flatMap(([file, entry]) =>
      entry.mutants
        .filter((mutant) => mutant?.status === "Timeout" && mutant.location?.start !== undefined)
        .map((mutant) => ({ file, mutant })),
    )
  if (timedOut.length === 0 || timedOut.length > limit) return { rerun: 0, caught: 0 }
  let caught = 0
  for (const { file, mutant } of timedOut) {
    rmSync(reportFile, { force: true })
    const range = `${file}:${String(mutant.location.start.line)}-${String(mutant.location.end.line)}`
    await stryker(
      ["run", config, "--force", "--reporters", "json", "--concurrency", "1", "--mutate", range],
      { cwd, quiet: true },
    )
    const again = readReport(reportFile)?.files?.[file]?.mutants?.find((other) =>
      sameMutant(mutant, other),
    )
    if (again !== undefined && STATUSES.has(again.status) && again.status !== "Timeout") {
      mutant.status = again.status
      mutant.statusReason = CAUGHT_ALONE
      caught += 1
    }
  }
  // Each re-run wrote its own report where the full run's was: put the full run's back.
  writeFileSync(reportFile, JSON.stringify(report))
  return { rerun: timedOut.length, caught }
}

/**
 * Says on stderr what happened to the installed Stryker Vitest runner.
 * @param {Record<string, any>} input - The command's input.
 * @param {{ status: string, vitestVersion?: string, runnerDir?: string } | undefined} compat - What the patch did,
 *   or `undefined` when the run was told to leave the runner alone.
 * @returns {void}
 */
function reportRunnerPatch(input, compat) {
  if (compat === undefined) {
    input.stderr(
      `[mutation] ${NO_PATCH}: @stryker-mutator/vitest-runner is left as installed. On Vitest 5, a runner without the stryker-js#6210 fix runs 0 tests per mutant.\n`,
    )
  } else if (compat.status === "patched") {
    input.stderr(
      `[mutation] Vitest ${compat.vitestVersion}: patched @stryker-mutator/vitest-runner's test-name separator to match Vitest 5 (stryker-js#6210). Pass ${NO_PATCH} to leave node_modules alone.\n`,
    )
  } else if (compat.status === "outside-project") {
    input.stderr(
      `[mutation] Vitest ${compat.vitestVersion}: skipped the stryker-js#6210 patch. The @stryker-mutator/vitest-runner that needs it is at ${compat.runnerDir}, outside this project, so it was left untouched. To apply it, run 'repo-contract mutation run' from the project whose node_modules holds it. Until then, every mutant may run 0 tests.\n`,
    )
  } else if (compat.unreadable !== undefined) {
    input.stderr(
      `[mutation] cannot read ${compat.unreadable}, so @stryker-mutator/vitest-runner was left as installed. If every mutant survives having run 0 tests, reinstall it and see stryker-js#6210.\n`,
    )
  } else if (compat.status === "unrecognised") {
    input.stderr(
      `[mutation] Vitest ${compat.vitestVersion} with an @stryker-mutator/vitest-runner this package does not recognise: if every mutant survives having run 0 tests, see stryker-js#6210.\n`,
    )
  }
}

/**
 * Resolves symbolic links in the part of a path that exists. The rest cannot hold a link yet.
 * @param {string} target - An absolute path.
 * @returns {string} The path with its nearest existing ancestor replaced by that one's realpath.
 */
function realpathOfExisting(target) {
  // A dangling link has no realpath; it is skipped, and its parent decides.
  const existing = ancestorsOf(target).find((dir) => existsSync(dir))
  return path.join(realpathSync(existing), path.relative(existing, target))
}

/**
 * Whether the run may delete `name`. The run deletes Stryker's sandbox recursively, and the
 * incremental file and report. An empty name or `.` is the project, and `..` its parent. A
 * symbolic link inside the project can lead out of it, so links are resolved first.
 * @param {string} cwd - The project.
 * @param {unknown} name - `tempDirName`, `incrementalFile` or `jsonReporter.fileName`.
 * @returns {boolean} Whether it is a relative path that resolves strictly inside the project.
 */
function isDeletableInside(cwd, name) {
  // `""` and `.` resolve to the project itself, which is not strictly inside it.
  if (typeof name !== "string" || path.isAbsolute(name)) return false
  const target = path.resolve(cwd, name)
  return (
    isStrictlyInside(cwd, target) && isStrictlyInside(realpathSync(cwd), realpathOfExisting(target))
  )
}

/**
 * Runs `mutation run`. Anything thrown on the way ends as an `error` report, so a missing file or
 * a failed write prints its cause instead of a stack trace.
 * @param {Record<string, any>} input - The command's input.
 * @param {Record<string, any>} options - The parsed options.
 * @param {string} cwd - The project.
 * @returns {Promise<number>} The exit status.
 */
async function runRun(input, options, cwd) {
  const base = {
    report: "",
    exitCode: null,
    shard: options.shard ?? null,
    mutate: options.mutate ?? null,
    timeouts: { rerun: 0, caught: 0 },
    inputs: null,
  }
  const finish = ({ state, message, ...report }) => {
    const full = { schemaVersion: 1, state, ...base, ...report, message }
    input.stdout(options.json ? `${JSON.stringify(full)}\n` : `${full.message}\n`)
    if (full.state === "ran") return full.exitCode ?? 1
    return full.state === "error" ? 1 : 0
  }
  try {
    return await runSteps(input, options, cwd, finish)
  } catch (thrown) {
    const cause = thrown instanceof Error ? thrown.message : String(thrown)
    return finish({
      state: "error",
      message: `The mutation run stopped: ${cause}. No report was judged.`,
    })
  }
}

/**
 * The steps of `mutation run`, from the config to the report.
 * @param {Record<string, any>} input - The command's input.
 * @param {Record<string, any>} options - The parsed options.
 * @param {string} cwd - The project.
 * @param {(report: Record<string, any>) => number} finish - Prints a report and returns the exit status.
 * @returns {Promise<number>} The exit status.
 */
async function runSteps(input, options, cwd, finish) {
  const error = (message) => finish({ state: "error", message })
  const directoryProblem = checkDirectory(cwd)
  if (directoryProblem !== undefined) return error(directoryProblem)

  if (options.mutate?.length === 0) {
    return options.report === undefined
      ? finish({
          state: "nothing-to-mutate",
          message: "Nothing to mutate: the mutate list is empty.",
        })
      : error(
          `${options.report} cannot be judged: the mutate list is empty, so it can be evidence of nothing.`,
        )
  }
  const loaded = await loadStrykerConfig(cwd, options.config)
  if (!loaded.ok) return error(loaded.error)
  const { config, file: configFile } = loaded
  const targets = options.mutate ?? targetsOf(cwd, config)

  if (options.report !== undefined) {
    const problem = await adoptionProblem(
      cwd,
      options.report,
      targets,
      input.mutantFree ?? mutantFreeFiles,
    )
    if (problem !== undefined) return error(problem)
    return finish({
      state: "adopted",
      report: options.report,
      message: `Judged ${options.report}; no mutant was run here.`,
    })
  }

  let restricted = options.mutate
  if (options.shard !== undefined) {
    const [index, total] = options.shard.split("/").map(Number)
    if (total > targets.length) {
      return error(
        `--shard ${options.shard} asks for ${String(total)} shards, but only ${String(targets.length)} file(s) are mutated.`,
      )
    }
    const sizes = Object.fromEntries(
      sized(cwd, targets).map((target) => [target.path, target.bytes]),
    )
    restricted = input.affected.planShards({ targets, timingsMs: sizes, shards: total }).shards[
      index - 1
    ]
  }

  const reportPath = config.jsonReporter?.fileName ?? "reports/mutation/mutation.json"
  const incremental = config.incrementalFile ?? "reports/stryker-incremental.json"
  const tempDir = config.tempDirName ?? ".stryker-tmp"
  const unsafe = [
    ["tempDirName", tempDir],
    ["incrementalFile", incremental],
    ["jsonReporter.fileName", reportPath],
  ].find(([, value]) => !isDeletableInside(cwd, value))
  if (unsafe !== undefined) {
    return error(
      `${configFile} sets ${unsafe[0]} to ${JSON.stringify(unsafe[1])}. It must be a relative path inside the project, because the run deletes it. Nothing was run or deleted.`,
    )
  }
  const reportFile = path.resolve(cwd, reportPath)
  const restriction = restricted === undefined ? "" : restricted.join(",")

  let cache
  let keyed
  if (options.cache !== "off") {
    keyed = await cacheInputs({
      cwd,
      git: input.git,
      config,
      restriction: `${options.shard ?? ""}\0${restriction}`,
      generated: [
        "node_modules",
        "reports",
        "coverage",
        tempDir,
        CACHE_DIRECTORY,
        reportPath,
        incremental,
      ],
      affected: input.affected,
    })
    if (keyed === undefined) {
      input.stderr("[mutation] the cache is off for this run: git cannot list the files.\n")
    } else {
      cache = input.affected.createCache({
        store: input.helpers.createFileCacheStore(path.join(cwd, CACHE_DIRECTORY)),
        mode: options.cache,
        now: input.now,
      })
      const found = await cache.lookup(CACHE_CHECK, keyed.key)
      if (found.hit) {
        // A cleaned checkout has no reports/ yet, and the cache key never depends on it.
        mkdirSync(path.dirname(reportFile), { recursive: true })
        writeFileSync(reportFile, JSON.stringify(found.entry.value))
        return finish({
          state: "reused",
          report: reportPath,
          inputs: keyed.key,
          message: `Reused a clean run: nothing it depends on has changed (inputs ${keyed.key.slice(0, 12)}).`,
        })
      }
    }
  }

  rmSync(path.resolve(cwd, incremental), { force: true })
  rmSync(reportFile, { force: true })
  reportRunnerPatch(input, options.patchVitestRunner ? ensureStrykerVitest5Compat(cwd) : undefined)

  const started = Date.now()
  const args = [
    "run",
    configFile,
    "--force",
    "--reporters",
    "json,clear-text",
    ...(restricted === undefined ? [] : ["--mutate", restriction]),
  ]
  const result = await input.stryker(args, { cwd, quiet: false })
  if (result.error !== undefined) {
    rmSync(path.join(cwd, tempDir), { recursive: true, force: true })
    return error(
      `Stryker could not start (${result.error}). Install @stryker-mutator/core as a development dependency.`,
    )
  }
  if (!existsSync(reportFile)) {
    rmSync(path.join(cwd, tempDir), { recursive: true, force: true })
    return finish({
      state: "error",
      exitCode: result.exitCode,
      message: `Stryker exited ${String(result.exitCode)} without writing ${reportPath}. Its output is above, on stderr.`,
    })
  }
  const timeouts = await confirmTimeouts({
    cwd,
    reportFile,
    config: configFile,
    limit: options.confirmTimeouts,
    stryker: input.stryker,
  })
  rmSync(path.join(cwd, tempDir), { recursive: true, force: true })

  const report = readReport(reportFile)
  if (cache !== undefined && result.exitCode === 0 && isClean(report)) {
    await cache.store({
      check: CACHE_CHECK,
      key: keyed.key,
      inputs: keyed.inputs,
      value: report,
      durationMs: Date.now() - started,
    })
  }
  const scope =
    options.shard !== undefined
      ? `shard ${options.shard} cold: ${String(restricted.length)} file(s)`
      : restricted === undefined
        ? "every mutant cold"
        : `${String(restricted.length)} file(s) cold`
  return finish({
    state: "ran",
    report: reportPath,
    exitCode: result.exitCode,
    timeouts,
    inputs: keyed?.key ?? null,
    message: `Stryker ran ${scope}.`,
  })
}

/**
 * Runs `repo-contract mutation`.
 * @param {Record<string, any>} input - argv, cwd, version, stdout, stderr, the `affected` and
 *   `helpers` engines, `stryker` (runs Stryker with its output on stderr), `git` (runs git in a
 *   directory), `now`, and for tests `mutantFree`.
 * @returns {Promise<number>} The exit status.
 */
export async function runMutation(input) {
  const parsed = parseMutationArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${MUTATION_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract mutation: ${parsed.message}\nTry 'repo-contract mutation --help' for more information.\n`,
    )
    return 2
  }
  const cwd = commandDirectory(input.cwd, parsed.options.cwd)
  return parsed.kind === "plan"
    ? runPlan(input, parsed.options, cwd)
    : runRun(input, parsed.options, cwd)
}
