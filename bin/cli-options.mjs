// The argument grammar `explain`, `except` and `exceptions` share: `--name value` or
// `--name=value` for an option with a value, a bare flag otherwise, and `--help` or `--version`
// anywhere before `--`. Everything after `--` is a bare argument. A value that starts with `-` is
// read as a missing value, so a forgotten value never swallows the next option.

import { accessSync, constants, statSync } from "node:fs"
import path from "node:path"

/**
 * Parses one command's arguments.
 * @param {readonly string[]} argv - The arguments after the command name.
 * @param {object} spec - What the command accepts.
 * @param {Readonly<Record<string, string>>} spec.values - Option name to the key its value lands under.
 * @param {Readonly<Record<string, string>>} [spec.repeated] - Options that may repeat; their values collect in an array.
 * @param {Readonly<Record<string, string>>} [spec.flags] - Flag name to the key set to `true`.
 * @param {number} [spec.positionals] - How many bare arguments the command takes. Default 0.
 * @returns {object} `help`, `version`, a usage `error`, or `{ kind: "run", options, positionals }`.
 */
export function parseCommandOptions(argv, spec) {
  const end = argv.indexOf("--")
  const head = end === -1 ? argv : argv.slice(0, end)
  if (head.some((arg) => arg === "--help" || arg === "-h")) return { kind: "help" }
  if (head.some((arg) => arg === "--version" || arg === "-V")) return { kind: "version" }

  const repeated = spec.repeated ?? {}
  const flags = spec.flags ?? {}
  const options = {}
  for (const key of Object.values(repeated)) options[key] = []
  const bare = []
  // A `for...of` over the entries cannot loop forever, whatever the body does to its position.
  let valueTaken = false
  for (const [index, arg] of head.entries()) {
    if (valueTaken) {
      valueTaken = false
      continue
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    const key = Object.hasOwn(spec.values, name)
      ? spec.values[name]
      : Object.hasOwn(repeated, name)
        ? repeated[name]
        : undefined
    if (key !== undefined) {
      const value = equals === -1 ? head[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("-"))) {
        return { kind: "error", message: `option '${name}' needs a value` }
      }
      valueTaken = equals === -1
      if (Array.isArray(options[key])) options[key].push(value)
      else options[key] = value
    } else if (Object.hasOwn(flags, arg)) {
      options[flags[arg]] = true
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else {
      bare.push(arg)
    }
  }
  const positionals = end === -1 ? bare : [...bare, ...argv.slice(end + 1)]
  const allowed = spec.positionals ?? 0
  if (positionals.length > allowed) {
    return { kind: "error", message: `unexpected argument '${positionals[allowed]}'` }
  }
  return { kind: "run", options, positionals }
}

/**
 * @param {unknown} error - Anything thrown.
 * @returns {string} A one-line message.
 */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Resolves the directory a command runs in.
 * @param {string} cwd - Where the process started.
 * @param {string | undefined} option - The `-C` value, if given.
 * @returns {string} The absolute directory.
 */
export function commandDirectory(cwd, option) {
  return option === undefined ? path.resolve(cwd) : path.resolve(cwd, option)
}

/**
 * Checks the directory a command runs in, before the command touches anything there. Without it, a
 * command fails on its first file with a bare ENOENT. A read that tolerates a missing file would
 * pass as if the directory were empty. The directory must exist and be one the process can list
 * and enter. It never throws, so every command reports the message through its usual failure line
 * or JSON error. Commands that inject their file access take it as their `checkDirectory` input;
 * the others call it directly.
 * @param {string} dir - An absolute path.
 * @returns {string | undefined} `undefined` for a directory. Otherwise a message: `the directory
 *   <dir> does not exist`, `<dir> is not a directory`, or `cannot read the directory <dir>:
 *   <code>`. That last one names the code stat failed with, such as ENAMETOOLONG or ELOOP. It
 *   names EACCES when the process may not read or enter the directory.
 */
export function checkDirectory(dir) {
  let stats
  try {
    stats = statSync(dir, { throwIfNoEntry: false })
  } catch (error) {
    return unreadable(dir, error)
  }
  if (stats === undefined) return `the directory ${dir} does not exist`
  if (!stats.isDirectory()) return `${dir} is not a directory`
  try {
    accessSync(dir, constants.R_OK | constants.X_OK)
  } catch (error) {
    return unreadable(dir, error)
  }
  return undefined
}

/**
 * @param {string} dir - The directory.
 * @param {unknown} error - What stat or access threw.
 * @returns {string} The message naming the error code.
 */
function unreadable(dir, error) {
  return `cannot read the directory ${dir}: ${/** @type {NodeJS.ErrnoException} */ (error).code}`
}
