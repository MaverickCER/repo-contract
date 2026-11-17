// `repo-contract exceptions`: count every exception record, by registry and type, with the legacy,
// expired and incomplete ones. It decides nothing: the check that owns a registry fails on it.
// Exit 0 after printing, even when a registry is unreadable (it is listed), 1 when -C names no
// readable directory, 2 for a usage error.
//
// The helpers' `readExceptionRegistries` lists a symbolic link as skipped and never follows it. Its
// reasons name an error code or a shape, never a registry's bytes.

import path from "node:path"
import { checkDirectory, commandDirectory, parseCommandOptions } from "./cli-options.mjs"

export const EXCEPTIONS_USAGE = `Usage: repo-contract exceptions [options]

Count the exception records in every registry: how many per exception type, and how many are
legacy (version 1), expired or incomplete. It judges nothing; the check that owns a registry does.
A registry that cannot be read is listed, not fatal. A symbolic link is listed as skipped and
never followed.

Options:
  --dir <dir>    Read registries from <dir> (default .repo-contract/exceptions)
  --json         Print the inventory as JSON
  -C <dir>       Run as if started in <dir>
  -h, --help     Show this help
  -V, --version  Print the version

Exit status: 0 after printing, 1 if -C names no readable directory, 2 for a usage error.`

const DEFAULT_DIRECTORY = ".repo-contract/exceptions"

/**
 * Parses the arguments after `exceptions`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExceptionsArgs(argv) {
  const parsed = parseCommandOptions(argv, {
    values: { "--dir": "dir", "-C": "cwd" },
    flags: { "--json": "json" },
  })
  if (parsed.kind !== "run") return parsed
  const { dir = DEFAULT_DIRECTORY, json = false, cwd } = parsed.options
  return { kind: "run", options: { dir, json, ...(cwd === undefined ? {} : { cwd }) } }
}

/**
 * Runs `repo-contract exceptions`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `exceptions`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.helpers - `readExceptionRegistries`, `summarizeExceptionRegistries`, `renderExceptionInventory`.
 * @param {() => Date} input.now - The clock `expires` is compared with.
 * @returns {Promise<number>} The exit status.
 */
export async function runExceptions(input) {
  const parsed = parseExceptionsArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${EXCEPTIONS_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract exceptions: ${parsed.message}\nTry 'repo-contract exceptions --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const root = commandDirectory(input.cwd, options.cwd)
  // A missing directory holds no registries, and "No exceptions recorded" would mislead.
  const directoryProblem = checkDirectory(root)
  if (directoryProblem !== undefined) {
    input.stderr(`repo-contract exceptions: ${directoryProblem}\n`)
    return 1
  }
  const { registries, errors } = await input.helpers.readExceptionRegistries(
    path.resolve(root, options.dir),
  )
  const inventory = input.helpers.summarizeExceptionRegistries(registries, input.now(), errors)
  input.stdout(
    options.json
      ? `${JSON.stringify(inventory, null, 2)}\n`
      : input.helpers.renderExceptionInventory(inventory),
  )
  return 0
}
