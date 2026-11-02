// `repo-contract merge-mutation` -- combine the Stryker reports of a sharded mutation run into
// the one report an unsharded run would have produced. It fails, rather than merging what it has,
// if a shard is missing, repeated, out of range, unreadable, or mutated a file another shard did.
// All input and output is injected (argv, stdout/stderr, file access, the engine) so the command is
// unit-testable without a process or a directory; bin/repo-contract.mjs wires the real ones.
// Conventions: data goes to stdout (unless --out) and diagnostics to stderr; exit status is 0 on
// success, 1 when the shards cannot be merged, 2 for a usage error.

import path from "node:path"

export const MERGE_MUTATION_USAGE = `Usage: repo-contract merge-mutation --total <n> [options] <shard>=<file>...

Combine the mutation reports of the shards of one run (see 'repo-contract affected --shard') into
one report. Name each report with its shard number, so a shard that never reported is noticed:

  repo-contract merge-mutation --total 3 --out reports/mutation.json 1=s1.json 2=s2.json 3=s3.json

Options:
  --total <n>   How many shards the run was split into (required)
  --out <file>  Write the merged report to <file> instead of stdout
  -C <dir>      Run as if started in <dir>
  -h, --help    Show this help
  -V, --version Print the version

Exit status: 0 on success, 1 if the shards cannot be merged, 2 for a usage error.`

const VALUE_OPTIONS = { "--total": "total", "--out": "out", "-C": "cwd" }

/**
 * Parses the arguments after `merge-mutation`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to `run` with.
 */
export function parseMergeMutationArgs(argv) {
  const beforeTerminator = argv.slice(0, Math.max(0, argv.indexOf("--") + 1 || argv.length))
  if (beforeTerminator.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  if (beforeTerminator.some((arg) => arg === "--version" || arg === "-V")) {
    return { kind: "version" }
  }
  const options = { reports: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (Object.hasOwn(VALUE_OPTIONS, name)) {
      const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("-"))) {
        return { kind: "error", message: `option '${name}' needs a value` }
      }
      index += equals === -1 ? 1 : 0
      if (name === "--total") {
        if (!/^[1-9]\d*$/.test(value)) {
          return {
            kind: "error",
            message: `option '--total' needs a positive whole number, not '${value}'`,
          }
        }
        options.total = Number(value)
      } else {
        options[VALUE_OPTIONS[name]] = value
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else {
      const match = /^([1-9]\d*)=(.+)$/.exec(arg)
      if (match === null) {
        return { kind: "error", message: `'${arg}' is not <shard>=<file>` }
      }
      options.reports.push({ shard: Number(match[1]), file: match[2] })
    }
  }
  if (options.total === undefined) {
    return { kind: "error", message: "--total <n> is required" }
  }
  if (options.reports.length === 0) {
    return { kind: "error", message: "give each shard's report as <shard>=<file>" }
  }
  return { kind: "run", options }
}

/**
 * @param {unknown} error - Anything thrown.
 * @returns {string} A one-line message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs `repo-contract merge-mutation`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `merge-mutation`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `mergeMutationReports`.
 * @param {(file: string) => Promise<string | undefined>} input.readFile - Reads a file.
 * @param {(file: string, text: string) => Promise<void>} input.writeFile - Writes a file.
 * @returns {Promise<number>} The exit status.
 */
export async function runMergeMutation(input) {
  const parsed = parseMergeMutationArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${MERGE_MUTATION_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract merge-mutation: ${parsed.message}\nTry 'repo-contract merge-mutation --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const root = path.resolve(input.cwd, options.cwd ?? ".")
  const fail = (message) => {
    input.stderr(`repo-contract merge-mutation: ${message}\n`)
    return 1
  }
  try {
    const reports = []
    for (const { shard, file } of options.reports) {
      const text = await input.readFile(path.resolve(root, file))
      if (text === undefined) {
        return fail(`could not read ${file}`)
      }
      try {
        reports.push({ shard, report: JSON.parse(text) })
      } catch {
        return fail(`${file} is not valid JSON`)
      }
    }
    const merged = input.engine.mergeMutationReports(reports, options.total)
    if (!merged.ok) {
      return fail(merged.error)
    }
    const text = `${JSON.stringify(merged.report, null, 2)}\n`
    if (options.out === undefined) {
      input.stdout(text)
    } else {
      await input.writeFile(path.resolve(root, options.out), text)
      input.stderr(
        `repo-contract merge-mutation: merged ${reports.length} shard${reports.length === 1 ? "" : "s"} into ${options.out}\n`,
      )
    }
    return 0
  } catch (error) {
    return fail(`failed: ${messageOf(error)}`)
  }
}
