// `repo-contract npm-script <script>`: run one of the package's npm scripts and print what the
// `npmScript` preset judges. With `--must-not-change`, it hashes those paths before and after, so
// a script that regenerates a committed file is caught without reading git. It reads files
// itself. Starting npm is injected (`exec`), because only bin/repo-contract.mjs may reach a
// process spawner (see that file's header). Data goes to stdout and diagnostics to stderr. It
// exits 0 when the script passed and changed nothing, and 1 otherwise or when the run could not
// start. A usage error exits 2.

import { createHash } from "node:crypto"
import { lstat, readFile, readdir, readlink } from "node:fs/promises"
import path from "node:path"
import { checkDirectory, commandDirectory } from "./cli-options.mjs"

export const NPM_SCRIPT_USAGE = `Usage: repo-contract npm-script <script> [options]

Runs \`npm run <script>\` in the package and reports how it ended. The npmScript preset runs
this command and judges the report.

Options:
  --must-not-change <path>  A file or directory the script must leave byte-identical; repeatable
  --timeout <ms>            Stop the script after this many milliseconds
  --json                    Print a machine-readable report (schemaVersion 1)
  -C <dir>                  Run as if started in <dir>
  -h, --help                Show this help
  -V, --version             Print the version

Exit status: 0 when the script exits 0 and changes no watched path, 1 when it fails, changes a
watched path, is missing or cannot start, 2 for a usage error.`

/** How many of the script's last output lines the report keeps. */
const TAIL_LINES = 40

/**
 * The most characters of each output stream the run holds. A script can print gigabytes, and the
 * report keeps 40 lines, so the rest would only fill memory.
 */
export const MAX_OUTPUT_CHARS = 64 * 1024

/**
 * Collects a stream's output, keeping only its last `limit` characters.
 * @param {number} limit - The most characters to hold.
 * @returns {{ push: (chunk: string) => void, text: () => string }} `push` takes each chunk.
 *   `text` returns what is kept, minus the first line once a cut has gone through it.
 */
export function outputTail(limit = MAX_OUTPUT_CHARS) {
  let kept = ""
  let cut = false
  return {
    push: (chunk) => {
      kept += chunk
      if (kept.length > limit) {
        kept = kept.slice(-limit)
        cut = true
      }
    },
    text: () => {
      // A line cut in half reads as a different line, unless it is all that is left. Without a
      // newline, `indexOf` gives -1 and the slice keeps everything.
      const newline = kept.indexOf("\n")
      return cut && newline < kept.length - 1 ? kept.slice(newline + 1) : kept
    },
  }
}

/**
 * Stops a timed-out script's process group with SIGKILL. The group may have exited after the
 * timer fired, and then the kill fails with ESRCH: there is nothing left to stop.
 * @param {(pid: number, signal: string) => unknown} kill - Sends a signal, as `process.kill` does.
 * @param {number | undefined} pid - The group leader's id; `undefined` when it never started.
 * @returns {boolean} Whether the signal was sent.
 */
export function stopProcessGroup(kill, pid) {
  if (pid === undefined) return false
  try {
    kill(-pid, "SIGKILL")
    return true
  } catch (error) {
    if (error?.code === "ESRCH") return false
    throw error
  }
}

const VALUE_OPTIONS = new Set(["--must-not-change", "--timeout", "-C"])

/**
 * Parses the arguments after `npm-script`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseNpmScriptArgs(argv) {
  if (argv.some((arg) => arg === "--help" || arg === "-h")) return { kind: "help" }
  if (argv.some((arg) => arg === "--version" || arg === "-V")) return { kind: "version" }
  const options = { mustNotChange: [], json: false }
  let script
  // A `for...of` over the entries cannot loop forever, whatever the body does to its position.
  let valueTaken = false
  for (const [index, arg] of argv.entries()) {
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
    if (!arg.startsWith("-")) {
      if (script !== undefined) return { kind: "error", message: `unexpected argument '${arg}'` }
      script = arg
      continue
    }
    if (!VALUE_OPTIONS.has(name)) return { kind: "error", message: `unknown option '${arg}'` }
    const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
    if (value === undefined || value === "" || value.startsWith("-")) {
      return { kind: "error", message: `option '${name}' needs a value` }
    }
    valueTaken = equals === -1
    if (name === "--must-not-change") options.mustNotChange.push(value)
    else if (name === "-C") options.cwd = value
    else if (/^[1-9]\d*$/.test(value)) options.timeoutMs = Number(value)
    else
      return { kind: "error", message: "option '--timeout' needs a whole number of milliseconds" }
  }
  if (script === undefined) return { kind: "error", message: "missing the npm script to run" }
  return { kind: "run", options: { script, ...options } }
}

/**
 * Hashes every file under the watched paths. A missing path hashes to nothing, so a file the
 * script creates or deletes shows as changed. A symbolic link hashes its target's name and is
 * never followed, so a link cycle cannot loop.
 * @param {string} dir - The package directory the paths are relative to.
 * @param {readonly string[]} roots - The watched paths.
 * @returns {Promise<Map<string, string>>} Each file's path, as given plus `/entry`, to its hash.
 */
async function hashTree(dir, roots) {
  const hashes = new Map()
  const walk = async (absolute, relative) => {
    let stat
    try {
      stat = await lstat(absolute)
    } catch {
      return
    }
    if (stat.isDirectory()) {
      for (const entry of await readdir(absolute)) {
        await walk(path.join(absolute, entry), path.posix.join(relative, entry))
      }
      return
    }
    const content = stat.isSymbolicLink() ? await readlink(absolute) : await readFile(absolute)
    hashes.set(relative, createHash("sha256").update(content).digest("hex"))
  }
  for (const root of roots) await walk(path.resolve(dir, root), root.split(path.sep).join("/"))
  return hashes
}

/**
 * @param {Map<string, string>} before - Hashes taken before the script ran.
 * @param {Map<string, string>} after - Hashes taken after.
 * @returns {string[]} Every path whose hash differs, created and deleted files included, sorted.
 */
function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => before.get(file) !== after.get(file))
    .sort()
}

/**
 * @param {string} stdout - What the script printed on stdout.
 * @param {string} stderr - What it printed on stderr.
 * @returns {string} The last lines of both, stdout first.
 */
function tail(stdout, stderr) {
  const text = [stdout.trimEnd(), stderr.trimEnd()].filter((part) => part !== "").join("\n")
  return text.split(/\r?\n/).slice(-TAIL_LINES).join("\n")
}

/**
 * @param {object} report - The run's report.
 * @param {number | undefined} timeoutMs - The time limit.
 * @returns {string} The report for a person to read.
 */
function render(report, timeoutMs) {
  const command = `npm run ${report.script}`
  if (report.state === "missing") return `package.json has no ${report.script} script.\n`
  const lines = report.output === "" ? [] : [report.output, ""]
  if (report.timedOut) lines.push(`${command} was stopped after ${String(timeoutMs)} ms.`)
  else if (report.exitCode !== 0) lines.push(`${command} exited ${String(report.exitCode)}.`)
  else if (report.changed.length === 0) {
    lines.push(`${command} exited 0 and changed no watched path.`)
  } else {
    lines.push(
      `${command} exited 0 and changed ${String(report.changed.length)} watched file(s):`,
      ...report.changed.map((file) => `- ${file}`),
    )
  }
  return `${lines.join("\n")}\n`
}

/**
 * Runs `repo-contract npm-script`.
 * @param {object} input - Everything the command touches beyond files, injected.
 * @param {readonly string[]} input.argv - The arguments after `npm-script`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {Function} input.exec - Runs a program with arguments and an optional time limit:
 *   `(command, args, { cwd, timeoutMs? })` resolves `{ exitCode, timedOut, stdout, stderr }`.
 * @returns {Promise<number>} The exit status.
 */
export async function runNpmScript(input) {
  const parsed = parseNpmScriptArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${NPM_SCRIPT_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract npm-script: ${parsed.message}\nTry 'repo-contract npm-script --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const dir = commandDirectory(input.cwd, options.cwd)
  const directoryProblem = checkDirectory(dir)
  if (directoryProblem !== undefined) {
    input.stderr(`repo-contract npm-script: ${directoryProblem}\n`)
    return 1
  }
  const manifest = path.join(dir, "package.json")
  let scripts
  try {
    scripts = JSON.parse(String(await readFile(manifest))).scripts
  } catch (error) {
    input.stderr(
      `repo-contract npm-script: cannot read ${manifest}: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  const report = await scriptReport({ ...input, dir, options, scripts })
  input.stdout(
    options.json ? `${JSON.stringify(report, null, 2)}\n` : render(report, options.timeoutMs),
  )
  // A missing script has no exit code, so it never passes.
  const passed = report.exitCode === 0 && !report.timedOut && report.changed.length === 0
  return passed ? 0 : 1
}

/**
 * @param {object} input - The command's input, with the resolved directory, options and scripts.
 * @returns {Promise<object>} The report.
 */
async function scriptReport(input) {
  const { dir, options, scripts } = input
  const { script, mustNotChange, timeoutMs } = options
  const base = { schemaVersion: 1, script }
  const defined =
    typeof scripts === "object" && scripts !== null && typeof scripts[script] === "string"
  if (!defined) {
    return { ...base, state: "missing", exitCode: null, timedOut: false, changed: [], output: "" }
  }
  const before = await hashTree(dir, mustNotChange)
  const result = await input.exec("npm", ["--loglevel=silent", "run", script], {
    cwd: dir,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
  const after = await hashTree(dir, mustNotChange)
  return {
    ...base,
    state: "ran",
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    changed: changedPaths(before, after),
    output: tail(result.stdout, result.stderr),
  }
}
