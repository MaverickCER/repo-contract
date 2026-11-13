// `repo-contract metrics`: summarize the run log (`.repo-contract/metrics/runs.jsonl`): how
// often runs pass, which checks fail, how much the cache and affected scope save. Read-only. All
// input and output is injected (argv, stdout/stderr, the file reader, the engine, the clock) so
// the command is unit-testable without a process or a directory; bin/repo-contract.mjs wires the
// real ones. Conventions: data goes to stdout and diagnostics to stderr; exit status is 0 on
// success, 1 when the command could not run, 2 for a usage error. Nothing is sent anywhere.

import path from "node:path"

export const METRICS_USAGE = `Usage: repo-contract metrics [options]

Summarize the run log: pass rate, failures by check and pillar, cache hit ratio, how much of the
test suite affected runs needed, estimated minutes saved, first-pass rate and the mutation score
trend. Only what the log supports is shown.

Options:
  --log <file>     Read <file> (default: .repo-contract/metrics/runs.jsonl)
  --since <when>   Only runs since a date (2026-11-01), or within the last <n>d or <n>h
  --actor <who>    Only runs by 'human' or 'agent'
  -C <dir>         Run as if started in <dir>
  --json           Print a machine-readable report (schemaVersion 1)
  -h, --help       Show this help
  -V, --version    Print the version

Exit status: 0 on success, 1 if the command could not run, 2 for a usage error.`

const DEFAULT_LOG = path.join(".repo-contract", "metrics", "runs.jsonl")
const VALUE_OPTIONS = { "--log": "log", "-C": "cwd", "--actor": "actor", "--since": "since" }
const UNITS = { d: 86_400_000, h: 3_600_000 }

/**
 * @param {string} value - What `--since` was given.
 * @returns {object | undefined} `{ days }`, `{ hours }` or `{ at }`, or `undefined` if unreadable.
 */
function sinceOf(value) {
  const relative = /^([1-9]\d*)([dh])$/.exec(value)
  if (relative !== null) {
    return { [relative[2] === "d" ? "days" : "hours"]: Number(relative[1]) }
  }
  const at = /^\d{4}-\d\d-\d\d/.test(value) ? Date.parse(value) : Number.NaN
  return Number.isNaN(at) ? undefined : { at: new Date(at).toISOString() }
}

/**
 * Parses the arguments after `metrics`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to `run` with.
 */
export function parseMetricsArgs(argv) {
  const beforeTerminator = argv.slice(0, Math.max(0, argv.indexOf("--") + 1 || argv.length))
  if (beforeTerminator.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  if (beforeTerminator.some((arg) => arg === "--version" || arg === "-V")) {
    return { kind: "version" }
  }
  const options = { json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      return { kind: "error", message: `unexpected argument '${argv[index + 1]}'` }
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (Object.hasOwn(VALUE_OPTIONS, name)) {
      const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("-"))) {
        return { kind: "error", message: `option '${name}' needs a value` }
      }
      index += equals === -1 ? 1 : 0
      if (name === "--actor" && value !== "human" && value !== "agent") {
        return { kind: "error", message: `option '--actor' must be human or agent, not '${value}'` }
      }
      const parsed = name === "--since" ? sinceOf(value) : value
      if (parsed === undefined) {
        return {
          kind: "error",
          message: `option '--since' needs a time like 2026-11-01, 7d or 12h, not '${value}'`,
        }
      }
      options[VALUE_OPTIONS[name]] = parsed
    } else if (name === "--json") {
      if (equals !== -1) {
        return { kind: "error", message: "option '--json' does not take a value" }
      }
      options.json = true
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else {
      return { kind: "error", message: `unexpected argument '${arg}'` }
    }
  }
  return { kind: "run", options }
}

/**
 * @param {object} since - A parsed `--since`.
 * @param {Date} now - The current time.
 * @returns {string} The ISO 8601 time it denotes.
 */
function resolveSince(since, now) {
  if (since.at !== undefined) {
    return since.at
  }
  const span = (since.days ?? 0) * UNITS.d + (since.hours ?? 0) * UNITS.h
  return new Date(now.getTime() - span).toISOString()
}

/**
 * @param {number} ratio - A fraction.
 * @returns {string} It as a percentage with one decimal.
 */
function percent(ratio) {
  return `${(ratio * 100).toFixed(1)}%`
}

/**
 * @param {string} title - A section title.
 * @param {Record<string, number>} counts - A count per name.
 * @returns {string[]} The section's lines, empty when there are no counts.
 */
function section(title, counts) {
  const names = Object.keys(counts).sort()
  return names.length === 0
    ? []
    : [`${title}:`, ...names.map((name) => `  ${name}: ${counts[name]}`)]
}

/**
 * @param {object} summary - The run summary.
 * @returns {string} The text report.
 */
function renderText(summary) {
  const lines = [
    `runs: ${summary.runs} (${summary.passed} passed, ${summary.failed} failed)`,
    `pass rate: ${percent(summary.passRate)}`,
  ]
  if (summary.firstPassRate !== undefined) {
    lines.push(`first-pass rate: ${percent(summary.firstPassRate)}`)
  }
  if (summary.cacheHitRatio !== undefined) {
    lines.push(`cache hit ratio: ${percent(summary.cacheHitRatio)}`)
  }
  if (summary.affectedRatio !== undefined) {
    lines.push(`affected tests: ${percent(summary.affectedRatio)} of all tests`)
  }
  if (summary.minutesSaved !== undefined) {
    lines.push(`minutes saved by affected runs: ${summary.minutesSaved.toFixed(1)}`)
  }
  if (summary.mutationScore !== undefined) {
    const { first, latest, delta } = summary.mutationScore
    lines.push(`mutation score: ${latest} (from ${first}, ${delta >= 0 ? "+" : ""}${delta})`)
  }
  if (summary.latestExceptions !== undefined) {
    lines.push(`exceptions: ${summary.latestExceptions}`)
  }
  if (summary.latestSuppressions !== undefined) {
    lines.push(`suppressions: ${summary.latestSuppressions}`)
  }
  lines.push(
    ...section("failures by check", summary.failuresByCheck),
    ...section("failures by pillar", summary.failuresByPillar),
    ...section("widenings by reason", summary.wideningsByReason),
  )
  return `${lines.join("\n")}\n`
}

/**
 * @param {unknown} error - Anything thrown.
 * @returns {string} A one-line message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs `repo-contract metrics`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `metrics`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `parseRunLog` and `summarizeRuns`.
 * @param {(file: string) => Promise<string | undefined>} input.readFile - Reads a file.
 * @param {() => Date} input.now - The clock.
 * @returns {Promise<number>} The exit status.
 */
export async function runMetrics(input) {
  const parsed = parseMetricsArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${METRICS_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract metrics: ${parsed.message}\nTry 'repo-contract metrics --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const root = path.resolve(input.cwd, options.cwd ?? ".")
  try {
    const text = await input.readFile(path.resolve(root, options.log ?? DEFAULT_LOG))
    const { records, errors } = input.engine.parseRunLog(text ?? "")
    if (errors.length > 0) {
      input.stderr(
        `repo-contract metrics: skipped ${errors.length} unreadable line${errors.length === 1 ? "" : "s"} (first: ${errors[0].message})\n`,
      )
    }
    const summary = input.engine.summarizeRuns(records, {
      ...(options.since === undefined ? {} : { since: resolveSince(options.since, input.now()) }),
      ...(options.actor === undefined ? {} : { actor: options.actor }),
    })
    if (options.json) {
      input.stdout(
        `${JSON.stringify({ schemaVersion: 1, summary, skippedLines: errors.length }, null, 2)}\n`,
      )
    } else {
      input.stdout(summary.runs === 0 ? "No runs recorded yet.\n" : renderText(summary))
    }
    return 0
  } catch (error) {
    input.stderr(`repo-contract metrics: failed: ${messageOf(error)}\n`)
    return 1
  }
}
