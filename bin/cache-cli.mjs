// `repo-contract cache` -- look at and tidy the computation cache under `.repo-contract/cache`.
// Everything the command touches is injected (argv, stdout/stderr, the store, the cache engine,
// the clock) so it is unit-testable without a process or a directory; bin/repo-contract.mjs wires
// the real ones. Conventions: data goes to stdout and diagnostics to stderr; exit status is 0 on
// success, 1 when the command could not run, 2 for a usage error. No prompts: `clear` and
// `prune` do what they say, and only ever touch the cache directory.

import path from "node:path"

export const CACHE_USAGE = `Usage: repo-contract cache <command> [options]

Inspect and tidy the computation cache (default: .repo-contract/cache).

Commands:
  stats          Count the entries, their size and the unreadable ones, per check
  clear          Remove every entry
  prune          Remove unreadable entries, and any beyond the limits below
  why <check> --inputs <file>
                 Say how <check>'s current inputs (a JSON object of input name to
                 digest) differ from its latest cache entry

Options:
  -C <dir>             Run as if started in <dir>
  --cache-dir <dir>    Use <dir> as the cache (default: .repo-contract/cache)
  --json               Print a machine-readable report (schemaVersion 1)
  --max-age <n>d|<n>h  prune: remove entries older than this
  --max-entries <n>    prune: keep only the <n> newest entries
  --inputs <file>      why: JSON object of input name to content digest
  -h, --help           Show this help
  -V, --version        Print the version

Exit status: 0 on success, 1 if the command could not run, 2 for a usage error.`

const COMMANDS = ["stats", "clear", "prune", "why"]
const VALUE_OPTIONS = {
  "--cache-dir": "cacheDir",
  "-C": "cwd",
  "--max-age": "maxAgeMs",
  "--max-entries": "maxEntries",
  "--inputs": "inputs",
}
const UNITS = { d: 86_400_000, h: 3_600_000 }

/**
 * @param {string} arg - The argument that should have been the end of the options.
 * @returns {object} A usage error.
 */
function unexpected(arg) {
  return { kind: "error", message: `unexpected argument '${arg}'` }
}

/**
 * @param {string} name - A limit option.
 * @param {string} value - What it was given.
 * @returns {number | object} The limit, or a usage error.
 */
function limit(name, value) {
  if (name === "--max-age") {
    const match = /^([1-9]\d*)([dh])$/.exec(value)
    return match === null
      ? {
          kind: "error",
          message: `option '--max-age' needs a duration like 7d or 12h, not '${value}'`,
        }
      : Number(match[1]) * UNITS[match[2]]
  }
  return /^\d+$/.test(value)
    ? Number(value)
    : { kind: "error", message: `option '--max-entries' needs a whole number, not '${value}'` }
}

/**
 * Parses the arguments after `cache`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the command and options to `run`.
 */
export function parseCacheArgs(argv) {
  const beforeTerminator = argv.slice(0, Math.max(0, argv.indexOf("--") + 1 || argv.length))
  if (beforeTerminator.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  if (beforeTerminator.some((arg) => arg === "--version" || arg === "-V")) {
    return { kind: "version" }
  }
  const options = { json: false }
  let command
  let check
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      return argv[index + 1] === undefined
        ? finish(command, options, check)
        : unexpected(argv[index + 1])
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (Object.hasOwn(VALUE_OPTIONS, name)) {
      const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("-"))) {
        return { kind: "error", message: `option '${name}' needs a value` }
      }
      index += equals === -1 ? 1 : 0
      const parsed = name === "--max-age" || name === "--max-entries" ? limit(name, value) : value
      if (typeof parsed === "object") {
        return parsed
      }
      options[VALUE_OPTIONS[name]] = parsed
    } else if (name === "--json") {
      if (equals !== -1) {
        return { kind: "error", message: "option '--json' does not take a value" }
      }
      options.json = true
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else if (command === undefined) {
      command = arg
    } else if (command === "why" && check === undefined) {
      check = arg
    } else {
      return unexpected(arg)
    }
  }
  return finish(command, options, check)
}

/**
 * @param {string | undefined} command - The command word, if one was given.
 * @param {object} options - The options read so far.
 * @param {string | undefined} check - The check id given to `why`, if any.
 * @returns {object} A usage error, or the command to run.
 */
function finish(command, options, check) {
  if (command === undefined) {
    return { kind: "error", message: `missing command: one of ${COMMANDS.join(", ")}` }
  }
  if (!COMMANDS.includes(command)) {
    return { kind: "error", message: `unknown command '${command}'` }
  }
  if (command !== "prune") {
    for (const name of ["--max-age", "--max-entries"]) {
      if (VALUE_OPTIONS[name] in options) {
        return { kind: "error", message: `option '${name}' only applies to 'prune'` }
      }
    }
  }
  if (command === "why") {
    if (check === undefined) {
      return { kind: "error", message: "missing check: 'why' needs the check id" }
    }
    if (options.inputs === undefined) {
      return { kind: "error", message: "'why' needs --inputs <file>" }
    }
    return { kind: "run", command, options, check }
  }
  if (options.inputs !== undefined) {
    return { kind: "error", message: "option '--inputs' only applies to 'why'" }
  }
  return { kind: "run", command, options }
}

/**
 * @param {number} bytes - A size.
 * @returns {string} It in B, KB or MB.
 */
function size(bytes) {
  if (bytes < 1024) {
    return `${String(bytes)} B`
  }
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * @param {number} count - A number of entries.
 * @returns {string} The count with its noun.
 */
function entries(count) {
  return `${String(count)} ${count === 1 ? "entry" : "entries"}`
}

/**
 * @param {unknown} error - Anything thrown.
 * @returns {string} A one-line message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {object} stats - What the cache holds.
 * @returns {string} The text report.
 */
function renderStats(stats) {
  const lines = [`${entries(stats.entries)} (${size(stats.bytes)})`]
  if (stats.corrupt > 0) {
    lines.push(`${String(stats.corrupt)} unreadable (run 'prune' to remove)`)
  }
  for (const check of Object.keys(stats.checks).sort()) {
    lines.push(`  ${check}: ${String(stats.checks[check])}`)
  }
  return `${lines.join("\n")}\n`
}

/**
 * @param {object} explanation - What `cache.why` answered.
 * @param {string} check - The check id.
 * @returns {string} The text report.
 */
function renderWhy(explanation, check) {
  if (explanation.kind === "no-previous") {
    return `${check}: no previous entry; the first run computes it.\n`
  }
  if (explanation.kind === "same-inputs") {
    return `${check}: inputs match the latest entry; a miss now comes from a tool version or the cache format.\n`
  }
  const lines = [
    `${check}: inputs differ from the latest entry (${explanation.comparedWith.slice(0, 12)}).`,
  ]
  for (const kind of ["changed", "added", "removed"]) {
    if (explanation[kind].length > 0) {
      lines.push(`  ${kind}: ${explanation[kind].join(", ")}`)
    }
  }
  return `${lines.join("\n")}\n`
}

/**
 * @param {(file: string) => Promise<string | undefined>} readFile - Reads a file.
 * @param {string} file - The path the user gave.
 * @param {string} resolved - Where it was found.
 * @returns {Promise<object | string>} The inputs, or an error message.
 */
async function readInputs(readFile, file, resolved) {
  const text = await readFile(resolved)
  if (text === undefined) {
    return `could not read inputs file ${file}`
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  const valid =
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    Object.values(parsed).every((digest) => typeof digest === "string")
  return valid ? parsed : `inputs file ${file} must be a JSON object of input name to digest`
}

/**
 * Runs `repo-contract cache`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `cache`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `createCache`.
 * @param {(dir: string) => object} input.createStore - Builds the store over a directory.
 * @param {(file: string) => Promise<string | undefined>} input.readFile - Reads a file (for `why`).
 * @param {() => Date} input.now - The clock.
 * @returns {Promise<number>} The exit status.
 */
export async function runCache(input) {
  const parsed = parseCacheArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${CACHE_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract cache: ${parsed.message}\nTry 'repo-contract cache --help' for more information.\n`,
    )
    return 2
  }

  const { command, options } = parsed
  const root = path.resolve(input.cwd, options.cwd ?? ".")
  const directory = path.resolve(root, options.cacheDir ?? path.join(".repo-contract", "cache"))
  try {
    const cache = input.engine.createCache({
      store: input.createStore(directory),
      mode: "read-write",
      now: input.now,
    })
    if (command === "why") {
      const inputs = await readInputs(
        input.readFile,
        options.inputs,
        path.resolve(root, options.inputs),
      )
      if (typeof inputs === "string") {
        input.stderr(`repo-contract cache: ${inputs}\n`)
        return 1
      }
      const explanation = await cache.why(parsed.check, inputs)
      input.stdout(
        options.json
          ? `${JSON.stringify({ schemaVersion: 1, check: parsed.check, ...explanation })}\n`
          : renderWhy(explanation, parsed.check),
      )
      return 0
    }
    if (command === "stats") {
      const stats = await cache.stats()
      input.stdout(
        options.json ? `${JSON.stringify({ schemaVersion: 1, ...stats })}\n` : renderStats(stats),
      )
      return 0
    }
    const removed =
      command === "clear"
        ? await cache.clear()
        : await cache.prune({
            ...(options.maxAgeMs === undefined ? {} : { maxAgeMs: options.maxAgeMs }),
            ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
          })
    input.stdout(
      options.json
        ? `${JSON.stringify({ schemaVersion: 1, removed })}\n`
        : `Removed ${entries(removed)}\n`,
    )
    return 0
  } catch (error) {
    input.stderr(`repo-contract cache: failed: ${messageOf(error)}\n`)
    return 1
  }
}
