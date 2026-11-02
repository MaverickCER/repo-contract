// `repo-contract doctor` -- find settings that make the affected-scope feature slower or wrong,
// and repair the ones that are safe to repair. All input and output is injected (argv, stdout and
// stderr, git and file access, the engine) so the command is unit-testable without a process or a
// repository; bin/repo-contract.mjs wires the real ones. Conventions: data goes to stdout and
// diagnostics to stderr; exit status is 0 on success (findings are the answer, not a failure), 1
// when the command could not run, 2 for a usage error. Without --fix nothing is written.

import path from "node:path"

export const DOCTOR_USAGE = `Usage: repo-contract doctor [options]

Look for settings that make affected-scope runs slower or wrong -- a cache directory that is not
ignored, a shallow CI checkout, a coverage config without the json reporter -- and say how to fix
each. Nothing is changed unless you pass --fix, which applies only the safe, mechanical repairs
and shows each change first.

Options:
  --fix          Apply the safe repairs
  --json         Print a machine-readable report (schemaVersion 1)
  -C <dir>       Run as if started in <dir>
  -h, --help     Show this help
  -V, --version  Print the version

Exit status: 0 on success (even when there are findings), 1 if the command could not run,
2 for a usage error.`

const VITEST_CONFIG = /(^|\/)vitest[^/]*\.config\.[cm]?[jt]s$|(^|\/)vitest\.workspace\.[cm]?[jt]s$/
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/
const SOURCE = /\.[cm]?tsx?$/
const NOT_SOURCE = /\.d\.[cm]?ts$|\.(test|spec)\.[cm]?tsx?$/
const STAR_EXPORT = /^\s*export\s+\*\s+(?:as\s+\w+\s+)?from\s/m

/**
 * Parses the arguments after `doctor`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to `run` with.
 */
export function parseDoctorArgs(argv) {
  const beforeTerminator = argv.slice(0, Math.max(0, argv.indexOf("--") + 1 || argv.length))
  if (beforeTerminator.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  if (beforeTerminator.some((arg) => arg === "--version" || arg === "-V")) {
    return { kind: "version" }
  }
  const options = { fix: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      return { kind: "error", message: `unexpected argument '${argv[index + 1]}'` }
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (name === "-C") {
      const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || value.startsWith("-")) {
        return { kind: "error", message: "option '-C' needs a value" }
      }
      options.cwd = value
      index += 1
    } else if (name === "--fix" || name === "--json") {
      if (equals !== -1) {
        return { kind: "error", message: `option '${name}' does not take a value` }
      }
      options[name.slice(2)] = true
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else {
      return { kind: "error", message: `unexpected argument '${arg}'` }
    }
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
 * @param {{ git: Function, readFile: Function }} capabilities - Git and file access.
 * @returns {Promise<object>} The facts `diagnose` needs.
 */
async function gather(capabilities) {
  const listing = (await capabilities.git(["ls-files", "-z"])) ?? ""
  const tracked = listing.split("\0").filter(Boolean)
  const contents = async (paths) =>
    (
      await Promise.all(
        paths.map(async (file) => ({ path: file, text: await capabilities.readFile(file) })),
      )
    ).filter((entry) => entry.text !== undefined)
  const sources = await contents(
    tracked.filter((file) => SOURCE.test(file) && !NOT_SOURCE.test(file)),
  )
  const hooksPath = ((await capabilities.git(["config", "core.hooksPath"])) ?? "").trim()
  return {
    gitignore: await capabilities.readFile(".gitignore"),
    vitestConfigs: await contents(tracked.filter((file) => VITEST_CONFIG.test(file))),
    workflows: await contents(tracked.filter((file) => WORKFLOW.test(file))),
    hooksInstalled:
      hooksPath !== "" || (await capabilities.readFile(".git/hooks/pre-commit")) !== undefined,
    starExportFiles: sources.filter(({ text }) => STAR_EXPORT.test(text)).map(({ path: p }) => p),
  }
}

/**
 * @param {{ file: string, before: string | undefined, after: string }} change - A planned change.
 * @returns {string} The lines it adds, in unified-diff style.
 */
function renderChange({ file, before, after }) {
  const added = after.slice(before === undefined ? 0 : before.length).replace(/^\n/, "")
  return [
    `--- ${file}`,
    `+++ ${file}`,
    ...added
      .split("\n")
      .filter(Boolean)
      .map((line) => `+${line}`),
  ].join("\n")
}

/**
 * @param {readonly object[]} findings - The findings.
 * @returns {string} One block per finding.
 */
function renderFindings(findings) {
  return findings
    .map(
      (finding) =>
        `${finding.severity.padEnd(4)}  ${finding.id}\n      ${finding.message}\n      ${finding.hint}`,
    )
    .join("\n")
}

/**
 * Runs `repo-contract doctor`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `doctor`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `diagnose` and `planFixes`.
 * @param {(dir: string) => object} input.createCapabilities - Builds git, read and write access.
 * @returns {Promise<number>} The exit status.
 */
export async function runDoctor(input) {
  const parsed = parseDoctorArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${DOCTOR_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract doctor: ${parsed.message}\nTry 'repo-contract doctor --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const dir = path.resolve(input.cwd, options.cwd ?? ".")
  try {
    const capabilities = input.createCapabilities(dir)
    const report = input.engine.diagnose(await gather(capabilities))
    const files = {}
    for (const finding of report.findings) {
      if (finding.fix !== undefined) {
        files[finding.fix.file] = await capabilities.readFile(finding.fix.file)
      }
    }
    const changes = input.engine.planFixes(report.findings, files)
    if (options.fix) {
      for (const change of changes) {
        await capabilities.writeFile(change.file, change.after)
      }
    }
    if (options.json) {
      input.stdout(
        `${JSON.stringify({ schemaVersion: 1, clean: report.clean, findings: report.findings, changes, applied: options.fix && changes.length > 0 }, null, 2)}\n`,
      )
      return 0
    }
    const lines = []
    if (report.findings.length === 0) {
      lines.push("Nothing to change.")
    } else {
      lines.push(renderFindings(report.findings))
      if (options.fix) {
        if (changes.length > 0) {
          lines.push("", ...changes.map(renderChange), "")
          lines.push(`Applied ${String(changes.length)} change${changes.length === 1 ? "" : "s"}.`)
        }
      } else if (changes.length > 0) {
        lines.push(
          "",
          `Run with --fix to apply ${String(changes.length)} safe change${changes.length === 1 ? "" : "s"}.`,
        )
      }
    }
    input.stdout(`${lines.join("\n")}\n`)
    return 0
  } catch (error) {
    input.stderr(`repo-contract doctor: failed: ${messageOf(error)}\n`)
    return 1
  }
}
