// `repo-contract affected` -- which tests and mutation targets can the current changes affect?
// All input and output is injected (argv, stdout/stderr, git and file access, the TypeScript
// compiler, the analysis engine) so the command is unit-testable without a process or a
// repository; bin/repo-contract.mjs wires the real ones. Conventions: data goes to stdout and
// diagnostics to stderr; exit status is 0 on success (an empty or "run everything" answer is still
// success), 1 when the command could not run, 2 for a usage error.

import path from "node:path"

export const AFFECTED_USAGE = `Usage: repo-contract affected [options]

Show which tests and mutation targets the changes in the working tree can affect, compared
with a base commit. When the analysis cannot be sure, it says so and reports everything.

Options:
  --base <ref>   Compare against <ref> (default: the upstream branch, then origin/main,
                 then origin/master)
  --tsconfig <file>
                 Read module-resolution options (paths, baseUrl) from <file> instead of
                 tsconfig.json
  -C <dir>       Run as if started in <dir>
  --json         Print a machine-readable report (schemaVersion 1)
  --explain      Say why each test is affected
  --tests        Print only the affected test files, one per line
  --sources      Print only the affected source files, one per line
  --mutate       Print only the mutation targets, one per line
  --shard <i>/<n>
                 Keep only shard <i> of <n> of the mutation targets, balanced by
                 recorded time (with --timings) so the shards finish together
  --timings <file>
                 JSON object of file to milliseconds, used to balance shards
  --plan-shards  Print a GitHub Actions matrix (JSON) for the mutation targets;
                 needs --shards or --target-minutes
  --shards <n>   --plan-shards: use <n> shards (never more than there are targets)
  --target-minutes <n>
                 --plan-shards: size the shards to about <n> minutes each
  --max-shards <n>
                 --plan-shards: with --target-minutes, use at most <n> shards
  -h, --help     Show this help
  -V, --version  Print the version

Exit status: 0 on success (even when everything is affected), 1 if the command could not
run, 2 for a usage error.`

const LIST_FORMATS = { "--tests": "tests", "--sources": "sources", "--mutate": "mutate" }
const VALUE_OPTIONS = {
  "--base": "base",
  "-C": "cwd",
  "--tsconfig": "tsconfig",
  "--shard": "shard",
  "--shards": "shards",
  "--target-minutes": "targetMinutes",
  "--max-shards": "maxShards",
  "--timings": "timings",
}
const FLAG_OPTIONS = new Set(["--json", "--explain", "--plan-shards", ...Object.keys(LIST_FORMATS)])
const WHOLE = new Set(["--shards", "--max-shards"])
const NUMERIC = { "--shards": 1, "--target-minutes": 1, "--max-shards": 1 }
const PLAN_ONLY = ["--shards", "--target-minutes", "--max-shards"]

/**
 * @param {string} name - A numeric option.
 * @param {string} value - What it was given.
 * @returns {number | object} The number, or a usage error.
 */
function numeric(name, value) {
  const number = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN
  const whole = WHOLE.has(name)
  return number > 0 && (!whole || Number.isInteger(number))
    ? number
    : {
        kind: "error",
        message: `option '${name}' needs a positive ${whole ? "whole number" : "number"}, not '${value}'`,
      }
}

/**
 * @param {string} value - The text of `--shard`.
 * @returns {{ index: number, total: number } | object} The shard, or a usage error.
 */
function shardOf(value) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value)
  const index = Number(match?.[1])
  const total = Number(match?.[2])
  return match === null || index > total
    ? {
        kind: "error",
        message: `A shard must be written <index>/<total> with 1 <= index <= total, not '${value}'.`,
      }
    : { index, total }
}

/**
 * Parses the arguments after `affected`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to `run` with.
 */
export function parseAffectedArgs(argv) {
  const beforeTerminator = argv.slice(0, Math.max(0, argv.indexOf("--") + 1 || argv.length))
  if (beforeTerminator.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  if (beforeTerminator.some((arg) => arg === "--version" || arg === "-V")) {
    return { kind: "version" }
  }
  const options = { format: "text", explain: false }
  let formatFlag
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      return unexpected(argv[index + 1])
    }
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (Object.hasOwn(VALUE_OPTIONS, name)) {
      const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("-"))) {
        return { kind: "error", message: `option '${name}' needs a value` }
      }
      const parsedValue =
        name === "--shard" ? shardOf(value) : name in NUMERIC ? numeric(name, value) : value
      if (parsedValue?.kind === "error") {
        return parsedValue
      }
      options[VALUE_OPTIONS[name]] = parsedValue
      index += equals === -1 ? 1 : 0
    } else if (FLAG_OPTIONS.has(name)) {
      if (equals !== -1) {
        return { kind: "error", message: `option '${name}' does not take a value` }
      }
      if (name === "--explain") {
        options.explain = true
      } else {
        if (formatFlag !== undefined) {
          return { kind: "error", message: `${formatFlag} cannot be combined with ${name}` }
        }
        formatFlag = name
        options.format =
          name === "--json" ? "json" : name === "--plan-shards" ? "plan" : LIST_FORMATS[name]
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `unknown option '${arg}'` }
    } else {
      return unexpected(arg)
    }
  }
  return checked(options, formatFlag)
}

/**
 * @param {object} options - The parsed options.
 * @param {string | undefined} formatFlag - The output-format flag that was given, if any.
 * @returns {object} A usage error, or the options to run with.
 */
function checked(options, formatFlag) {
  const plan = options.format === "plan"
  const refusal = (message) => ({ kind: "error", message })
  if (options.explain && options.format in { tests: 1, sources: 1, mutate: 1, plan: 1 }) {
    return refusal(`--explain cannot be combined with ${formatFlag}`)
  }
  if (plan && options.shard !== undefined) {
    return refusal("--shard cannot be combined with --plan-shards")
  }
  if (options.shard !== undefined && (options.format === "tests" || options.format === "sources")) {
    return refusal("--shard only applies to the mutation targets")
  }
  if (plan && options.shards === undefined && options.targetMinutes === undefined) {
    return refusal("--plan-shards needs --shards <n> or --target-minutes <n>")
  }
  const misplaced = plan
    ? undefined
    : PLAN_ONLY.find((name) => options[VALUE_OPTIONS[name]] !== undefined)
  if (misplaced !== undefined) {
    return refusal(`${misplaced} only applies with --plan-shards`)
  }
  if (options.timings !== undefined && !plan && options.shard === undefined) {
    return refusal("--timings only applies with --shard or --plan-shards")
  }
  return { kind: "run", options }
}

/**
 * @param {string} arg - The stray argument.
 * @returns {object} A usage error.
 */
function unexpected(arg) {
  return { kind: "error", message: `unexpected argument '${arg}'` }
}

/**
 * @param {unknown} error - Anything thrown.
 * @returns {string} A one-line message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {object} because - A widening.
 * @returns {string} `reason: file`, with the detail when there is one.
 */
function reasonText({ reason, file, detail }) {
  return `${reason}: ${file}${detail === undefined ? "" : ` -- ${detail}`}`
}

/**
 * @param {object} result - The analysis result.
 * @param {string[]} explanations - One line per affected test, or empty.
 * @returns {string} The text report.
 */
function renderText(result, explanations, shard) {
  const lines = [
    result.scope === "full" ? `scope: full (${reasonText(result.fullBecause)})` : "scope: affected",
    "",
  ]
  const sections = [
    ["changed files", result.changedFiles],
    ["changed symbols", result.changedSymbols],
    ["affected tests", result.affectedTests],
    [
      "mutation targets",
      result.mutateTargets,
      shard === undefined ? "" : `, shard ${shard.index}/${shard.total}`,
    ],
  ]
  let shown = false
  for (const [title, items, note = ""] of sections) {
    if (items.length > 0) {
      shown = true
      lines.push(`${title} (${items.length}${note}):`, ...items.map((item) => `  ${item}`), "")
    }
  }
  if (!shown) {
    lines.push("nothing is affected", "")
  }
  if (explanations.length > 0) {
    lines.push("why:", ...explanations.map((line) => `  ${line}`), "")
  }
  return lines.join("\n")
}

/**
 * @param {object} result - The analysis result.
 * @param {string[]} explanations - One line per affected test, or empty.
 * @param {boolean} explain - Whether to include the explanations.
 * @returns {string} The JSON report.
 */
function renderJson(result, explanations, explain, shard) {
  const report = {
    schemaVersion: 1,
    scope: result.scope,
    ...(result.fullBecause === undefined ? {} : { fullBecause: result.fullBecause }),
    changedFiles: result.changedFiles,
    changedSymbols: result.changedSymbols,
    affectedSources: result.affectedSources,
    affectedTests: result.affectedTests,
    mutateTargets: result.mutateTargets,
    widened: result.widened,
    ...(shard === undefined ? {} : { shard }),
    ...(explain ? { explanations } : {}),
  }
  return `${JSON.stringify(report, null, 2)}\n`
}

/**
 * Reads this tool's block from the project's package.json (`"repo-contract"."affected"`).
 * @param {{ readFile: (path: string) => Promise<string | undefined> }} capabilities - File access.
 * @param {(value: unknown) => object} parse - Validates the block.
 * @returns {Promise<{ options?: object, error?: string }>} The options, or what is wrong.
 */
async function readConfig(capabilities, parse) {
  const text = await capabilities.readFile("package.json")
  if (text === undefined) {
    return { options: {} }
  }
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch {
    return { error: "package.json is not valid JSON" }
  }
  const parsed = parse(manifest?.["repo-contract"]?.affected)
  return "error" in parsed
    ? { error: `invalid configuration in package.json (repo-contract.affected): ${parsed.error}` }
    : { options: parsed.options }
}

/**
 * @param {{ readFile: (path: string) => Promise<string | undefined> }} capabilities - File access.
 * @param {string | undefined} file - The `--timings` file, if any.
 * @returns {Promise<object | string>} File to milliseconds (empty without a file), or an error message.
 */
async function readTimings(capabilities, file) {
  if (file === undefined) {
    return {}
  }
  const text = await capabilities.readFile(file)
  if (text === undefined) {
    return `could not read timings file ${file}`
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
    Object.values(parsed).every((ms) => typeof ms === "number" && ms >= 0 && Number.isFinite(ms))
  return valid ? parsed : `timings file ${file} must be a JSON object of file to milliseconds`
}

const LISTS = { tests: "affectedTests", sources: "affectedSources", mutate: "mutateTargets" }

/**
 * Runs `repo-contract affected`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `affected`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `computeAffectedFromGit`, `explainAffected` and `parseAffectedConfig`.
 * @param {(dir: string) => object} input.createCapabilities - Builds the git and file capabilities.
 * @param {(dir: string) => Promise<object>} input.loadTypeScript - Loads the project's TypeScript.
 * @returns {Promise<number>} The exit status.
 */
export async function runAffected(input) {
  const parsed = parseAffectedArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${AFFECTED_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract affected: ${parsed.message}\nTry 'repo-contract affected --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const dir = path.resolve(input.cwd, options.cwd ?? ".")
  let ts
  try {
    ts = await input.loadTypeScript(dir)
  } catch (error) {
    input.stderr(
      `repo-contract affected: could not load TypeScript from ${dir}: ${messageOf(error)}\nInstall it with: npm install --save-dev typescript\n`,
    )
    return 1
  }
  if (typeof ts?.createSourceFile !== "function") {
    input.stderr(
      "repo-contract affected: the installed TypeScript has no compiler API (TypeScript 7 does not); install typescript@6 or earlier\n",
    )
    return 1
  }

  let result
  let capabilities
  try {
    capabilities = input.createCapabilities(dir)
    const config = await readConfig(capabilities, input.engine.parseAffectedConfig)
    if (config.error !== undefined) {
      input.stderr(`repo-contract affected: ${config.error}\n`)
      return 1
    }
    result = await input.engine.computeAffectedFromGit({
      ts,
      capabilities,
      options: config.options,
      ...(options.base === undefined ? {} : { base: options.base }),
      ...(options.tsconfig === undefined ? {} : { tsconfig: options.tsconfig }),
    })
  } catch (error) {
    input.stderr(`repo-contract affected: failed: ${messageOf(error)}\n`)
    return 1
  }

  if (result.scope === "full") {
    input.stderr(`repo-contract affected: running everything (${reasonText(result.fullBecause)})\n`)
  }
  const timings = await readTimings(capabilities, options.timings)
  if (typeof timings === "string") {
    input.stderr(`repo-contract affected: ${timings}\n`)
    return 1
  }
  if (options.format === "plan") {
    const plan = input.engine.planShards({
      targets: result.mutateTargets,
      timingsMs: timings,
      ...(options.shards === undefined ? {} : { shards: options.shards }),
      ...(options.targetMinutes === undefined ? {} : { targetMinutes: options.targetMinutes }),
      ...(options.maxShards === undefined ? {} : { max: options.maxShards }),
    })
    input.stdout(
      `${JSON.stringify({ count: plan.count, ...input.engine.shardMatrix(plan.count) }, null, 2)}\n`,
    )
    return 0
  }
  if (options.shard !== undefined) {
    const plan = input.engine.planShards({
      targets: result.mutateTargets,
      timingsMs: timings,
      shards: options.shard.total,
    })
    result = { ...result, mutateTargets: plan.shards[options.shard.index - 1] ?? [] }
  }
  const explanations = options.explain ? input.engine.explainAffected(result) : []
  if (options.format === "json") {
    input.stdout(renderJson(result, explanations, options.explain, options.shard))
  } else if (options.format === "text") {
    input.stdout(renderText(result, explanations, options.shard))
  } else {
    input.stdout(result[LISTS[options.format]].map((item) => `${item}\n`).join(""))
  }
  return 0
}
