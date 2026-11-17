// `repo-contract quick-start`: run a README's marked quick start against the tarball npm would
// publish, in an empty project, and fail when any command fails. It reads files and makes a
// temporary directory itself. Starting processes is injected (`exec` and `shell`), because only
// bin/repo-contract.mjs may reach a process spawner (see that file's header). Conventions match
// the other commands: data on stdout and diagnostics on stderr. The exit status is 0 when every
// command passed, 1 when one failed or the run could not start, and 2 for a usage error.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { checkDirectory } from "./cli-options.mjs"

export const QUICK_START_USAGE = `Usage: repo-contract quick-start [options]

Runs the README's marked quick start, one line at a time, against the tarball npm would publish.
The commands run in an empty project: a directory holding only a package.json. The command that
installs this package installs the packed tarball instead. Mark the block like this:

  <!-- quick-start:begin -->
  \`\`\`sh
  npm install --save-dev your-package
  npx your-package --help
  \`\`\`
  <!-- quick-start:end -->

Options:
  --readme <file>  The Markdown file that holds the block (default: README.md)
  --timeout <ms>   Time all the commands together may take (default: 300000)
  --json           Print a machine-readable report (schemaVersion 1)
  -C <dir>         Run as if started in <dir>
  -h, --help       Show this help
  -V, --version    Print the version

Exit status: 0 when every command exits 0, 1 when one fails or the run could not start,
2 for a usage error.`

export const BEGIN_MARKER = "<!-- quick-start:begin -->"
export const END_MARKER = "<!-- quick-start:end -->"

const DEFAULT_TIMEOUT_MS = 300_000
const SHELL_FENCES = new Set(["sh", "shell", "bash"])
const INSTALLERS = new Map([
  ["npm", new Set(["install", "i", "add"])],
  ["pnpm", new Set(["add", "install", "i"])],
  ["yarn", new Set(["add"])],
  ["bun", new Set(["add", "install", "i"])],
])
const TAIL_LINES = 20

/**
 * Parses the arguments after `quick-start`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseQuickStartArgs(argv) {
  if (argv.some((arg) => arg === "--help" || arg === "-h")) return { kind: "help" }
  if (argv.some((arg) => arg === "--version" || arg === "-V")) return { kind: "version" }
  const options = { readme: "README.md", timeoutMs: DEFAULT_TIMEOUT_MS, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (name === "--json") {
      if (equals !== -1) return { kind: "error", message: "option '--json' does not take a value" }
      options.json = true
      continue
    }
    if (name !== "--readme" && name !== "--timeout" && name !== "-C") {
      return {
        kind: "error",
        message: arg.startsWith("-") ? `unknown option '${arg}'` : `unexpected argument '${arg}'`,
      }
    }
    const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
    if (value === undefined || value === "" || value.startsWith("-")) {
      return { kind: "error", message: `option '${name}' needs a value` }
    }
    if (equals === -1) index += 1
    if (name === "--readme") options.readme = value
    else if (name === "-C") options.cwd = value
    else if (/^[1-9]\d*$/.test(value)) options.timeoutMs = Number(value)
    else
      return { kind: "error", message: `option '--timeout' needs a whole number of milliseconds` }
  }
  return { kind: "run", options }
}

/**
 * Finds the marked quick start in a Markdown document.
 * @param {string} markdown - The document.
 * @returns {object} `none` when it has no marker, `invalid` with a reason, or `found` with the
 *   commands. Each line is one command; comments and blank lines are left out, and a line ending
 *   in `\` is joined to the next.
 */
export function extractQuickStart(markdown) {
  const lines = markdown.split(/\r?\n/)
  const begins = lines.flatMap((line, index) => (line.trim() === BEGIN_MARKER ? [index] : []))
  const ends = lines.flatMap((line, index) => (line.trim() === END_MARKER ? [index] : []))
  if (begins.length === 0 && ends.length === 0) return { kind: "none" }
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    return {
      kind: "invalid",
      reason: `expected one ${BEGIN_MARKER} followed by one ${END_MARKER}; found ${String(begins.length)} and ${String(ends.length)}.`,
    }
  }
  const inside = lines.slice(begins[0] + 1, ends[0]).filter((line) => line.trim() !== "")
  const open = /^```(\S*)$/.exec(inside[0]?.trim() ?? "")
  if (open === null || inside.at(-1)?.trim() !== "```" || inside.length < 2) {
    return {
      kind: "invalid",
      reason: "the markers must hold one fenced code block and nothing else.",
    }
  }
  if (!SHELL_FENCES.has(open[1])) {
    return {
      kind: "invalid",
      reason: `the fenced block must be marked sh, shell or bash; it is marked ${JSON.stringify(open[1])}.`,
    }
  }
  const commands = []
  let pending = ""
  for (const line of inside.slice(1, -1)) {
    const text = `${pending}${line.trim()}`
    if (text.endsWith("\\")) {
      pending = `${text.slice(0, -1).trimEnd()} `
    } else {
      pending = ""
      if (!text.startsWith("#")) commands.push(text)
    }
  }
  if (pending !== "") commands.push(pending.trim())
  if (commands.length === 0) return { kind: "invalid", reason: "the fenced block has no commands." }
  return { kind: "found", commands }
}

/**
 * Points every command that installs `packageName` at the packed tarball instead.
 * @param {readonly string[]} commands - The quick start's commands.
 * @param {string} packageName - package.json's `name`.
 * @param {string} tarball - The tarball's path, relative to the project.
 * @returns {{ commands: string[], installs: number }} The rewritten commands, and how many of
 *   them install the package.
 */
export function installTarball(commands, packageName, tarball) {
  let installs = 0
  const rewritten = commands.map((command) => {
    const words = command.split(/(\s+)/)
    const verbs = INSTALLERS.get(words[0])
    if (verbs === undefined || !verbs.has(words[2])) return command
    let replaced = false
    const result = words.map((word, index) => {
      if (index < 4 || (word !== packageName && !word.startsWith(`${packageName}@`))) return word
      replaced = true
      return tarball
    })
    if (replaced) installs += 1
    return result.join("")
  })
  return { commands: rewritten, installs }
}

/**
 * @param {string} output - A command's combined output.
 * @returns {string} Its last lines.
 */
function tail(output) {
  return output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join("\n")
}

/**
 * Packs the package and runs the quick start in an empty project under `work`.
 * @param {object} input - What the run needs.
 * @returns {Promise<object>} The report, without `schemaVersion` and `readme`.
 */
async function runIn(input) {
  const { dir, work, commands, packageName, exec, shell, now, timeoutMs } = input
  const packDir = path.join(work, "tarball")
  const project = path.join(work, "project")
  await mkdir(packDir)
  await mkdir(project)
  const packed = await exec("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], {
    cwd: dir,
  })
  const file = packed.stdout.trim().split(/\r?\n/).at(-1) ?? ""
  if (packed.exitCode !== 0 || !file.endsWith(".tgz")) {
    return {
      state: "error",
      message: `npm pack failed:\n${tail(`${packed.stdout}${packed.stderr}`)}`,
    }
  }
  const plan = installTarball(commands, packageName, `../tarball/${file}`)
  if (plan.installs === 0) {
    return {
      state: "no-install",
      message: `no command installs ${packageName} with npm, pnpm, yarn or bun, so the quick start would not run the packed tarball.`,
    }
  }
  await writeFile(
    path.join(project, "package.json"),
    `${JSON.stringify({ name: "quick-start", version: "1.0.0" }, null, 2)}\n`,
  )
  const deadline = now() + timeoutMs
  const ran = []
  for (const command of plan.commands) {
    const started = now()
    const remaining = deadline - started
    const result =
      remaining > 0
        ? await shell(command, { cwd: project, timeoutMs: remaining })
        : { exitCode: null, timedOut: true, output: "" }
    ran.push({
      command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: now() - started,
    })
    if (result.timedOut || result.exitCode !== 0) {
      return { state: "failed", commands: ran, output: tail(result.output) }
    }
  }
  return { state: "passed", commands: ran }
}

/**
 * @param {object} report - The run's report.
 * @param {number} timeoutMs - The time budget.
 * @returns {string} The report for a person to read.
 */
function render(report, timeoutMs) {
  const lines = (report.commands ?? []).map(
    (entry) =>
      `${entry.exitCode === 0 ? "ok  " : "FAIL"}  ${entry.command}${entry.timedOut ? ` (stopped after the ${String(timeoutMs)} ms budget)` : ""}`,
  )
  if (report.output) lines.push("", report.output)
  if (report.message) lines.push(report.message)
  if (report.state === "passed")
    lines.push("", "The quick start passed against the packed tarball.")
  return `${lines.join("\n")}\n`
}

/**
 * Runs `repo-contract quick-start`.
 * @param {object} input - Everything the command touches beyond files, injected.
 * @param {readonly string[]} input.argv - The arguments after `quick-start`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {Function} input.exec - Runs a program with arguments: `{ exitCode, stdout, stderr }`.
 * @param {Function} input.shell - Runs one command line in a shell with a time limit:
 *   `{ exitCode, timedOut, output }`.
 * @param {() => number} input.now - The current time in milliseconds.
 * @returns {Promise<number>} The exit status.
 */
export async function runQuickStart(input) {
  const parsed = parseQuickStartArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${QUICK_START_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract quick-start: ${parsed.message}\nTry 'repo-contract quick-start --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const dir = path.resolve(input.cwd, options.cwd ?? ".")
  const report = await quickStartReport({ ...input, dir, options })
  const full = { schemaVersion: 1, readme: options.readme, ...report }
  if (options.json) input.stdout(`${JSON.stringify(full, null, 2)}\n`)
  else input.stdout(render(full, options.timeoutMs))
  return report.state === "passed" ? 0 : 1
}

/**
 * @param {object} input - The command's input, with the resolved directory and options.
 * @returns {Promise<object>} The report.
 */
async function quickStartReport(input) {
  const { dir, options } = input
  const directoryProblem = checkDirectory(dir)
  if (directoryProblem !== undefined) return { state: "error", message: directoryProblem }
  let markdown
  let packageName
  try {
    markdown = await readFile(path.resolve(dir, options.readme), "utf8")
    packageName = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).name
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : String(error) }
  }
  const block = extractQuickStart(markdown)
  if (block.kind === "none") {
    return {
      state: "no-block",
      message: `${options.readme} has no marked quick start. Put ${BEGIN_MARKER} on the line before its fenced shell block and ${END_MARKER} on the line after it.`,
    }
  }
  if (block.kind === "invalid") {
    return { state: "invalid", message: `${options.readme}'s quick start: ${block.reason}` }
  }
  if (typeof packageName !== "string" || packageName === "") {
    return { state: "error", message: "package.json has no name to install." }
  }
  const work = await mkdtemp(path.join(tmpdir(), "repo-contract-quick-start-"))
  try {
    return await runIn({
      dir,
      work,
      commands: block.commands,
      packageName,
      exec: input.exec,
      shell: input.shell,
      now: input.now,
      timeoutMs: options.timeoutMs,
    })
  } finally {
    // Best effort: Windows can hold a file a just-ended process wrote, and the OS reaps tmpdir.
    await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(
      () => undefined,
    )
  }
}
