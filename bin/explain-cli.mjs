// `repo-contract explain`: print what the project's config runs, and every setting looser than its
// tier. It loads the config through tsx, resolved from the project, which the generated runner
// already needs. Loading runs the config's top-level code but starts no check. Data goes to
// stdout and diagnostics to stderr. Exit 0 when the config loaded, 1 when it could not, 2 for a
// usage error.

import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { commandDirectory, messageOf, parseCommandOptions } from "./cli-options.mjs"

export const EXPLAIN_USAGE = `Usage: repo-contract explain [options]

Show what the config runs: each check with its settings, every setting looser than the tier the
config spreads, the tier's checks the config lacks, and the checks planned for a later release.
Settings come from the tier's metadata, so a check you replaced by hand shows the tier's settings,
and a config built without a tier has its checks listed but no settings compared.

The config loads through tsx, which must be a devDependency of the project.

Options:
  --config <file>  Load <file> (default: the first of repo-contract.config.mts, .ts, .mjs)
  --json           Print the explanation as JSON
  --markdown       Print it as Markdown, for a report or a CI step summary
  -C <dir>         Run as if started in <dir>
  -h, --help       Show this help
  -V, --version    Print the version

Exit status: 0 when printed, 1 when the config cannot be loaded, 2 for a usage error.`

const DEFAULT_CONFIGS = [
  "repo-contract.config.mts",
  "repo-contract.config.ts",
  "repo-contract.config.mjs",
]

/**
 * Parses the arguments after `explain`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExplainArgs(argv) {
  const parsed = parseCommandOptions(argv, {
    values: { "--config": "config", "-C": "cwd" },
    flags: { "--json": "json", "--markdown": "markdown" },
  })
  if (parsed.kind !== "run") return parsed
  const { config, cwd, json, markdown } = parsed.options
  if (json && markdown) return { kind: "error", message: "choose one of --json and --markdown" }
  return {
    kind: "run",
    options: {
      ...(config === undefined ? {} : { config }),
      format: json ? "json" : markdown ? "markdown" : "text",
      ...(cwd === undefined ? {} : { cwd }),
    },
  }
}

/** A failure that ends the command with exit 1 and one message. */
class ExplainError extends Error {}

/**
 * Loads a TypeScript or JavaScript config with the project's own tsx.
 * @param {string} file - The config's absolute path.
 * @param {string} root - The project directory tsx resolves from.
 * @param {(from: string) => NodeJS.Require} createRequire - `node:module`'s `createRequire`.
 * @returns {Promise<Record<string, unknown>>} The config module's namespace.
 */
async function loadWithTsx(file, root, createRequire) {
  let api
  try {
    api = createRequire(path.join(root, "package.json")).resolve("tsx/esm/api")
  } catch {
    throw new ExplainError(
      "explain loads the config through tsx, which this project does not have. Run: npm install --save-dev tsx",
    )
  }
  const { tsImport } = await import(pathToFileURL(api).href)
  const url = pathToFileURL(file).href
  return tsImport(url, url)
}

/**
 * @param {unknown} value - A candidate config.
 * @returns {boolean} Whether it is an object with a `checks` object.
 */
function hasChecks(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.checks === "object" &&
    value.checks !== null
  )
}

/**
 * Runs `repo-contract explain`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `explain`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.engine - `explainTier` and `renderExplain` from `repo-contract/tiers`.
 * @param {(from: string) => NodeJS.Require} input.createRequire - Resolves tsx from the project.
 * @returns {Promise<number>} The exit status.
 */
export async function runExplain(input) {
  const parsed = parseExplainArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${EXPLAIN_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract explain: ${parsed.message}\nTry 'repo-contract explain --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const root = commandDirectory(input.cwd, options.cwd)
  try {
    const name =
      options.config ?? DEFAULT_CONFIGS.find((candidate) => existsSync(path.join(root, candidate)))
    if (name === undefined) {
      throw new ExplainError(
        `no ${DEFAULT_CONFIGS.slice(0, -1).join(", ")} or ${DEFAULT_CONFIGS.at(-1)} in ${root}. Name one with --config, or run \`repo-contract init --preset <tier>\`.`,
      )
    }
    const file = path.resolve(root, name)
    if (!existsSync(file)) throw new ExplainError(`${name} does not exist.`)

    let loaded
    try {
      loaded = await loadWithTsx(file, root, input.createRequire)
    } catch (error) {
      if (error instanceof ExplainError) throw error
      throw new ExplainError(`could not load ${name}: ${messageOf(error)}`)
    }
    // A `.ts` config in a package without `"type": "module"` loads as CommonJS, so its default
    // export arrives one level down.
    const config = [loaded?.default, loaded?.default?.default].find(hasChecks)
    if (config === undefined) {
      throw new ExplainError(`${name} has no default export with a checks object.`)
    }

    const explanation = input.engine.explainTier(config)
    const display = path.relative(root, file).split(path.sep).join("/")
    input.stdout(
      options.format === "json"
        ? `${JSON.stringify({ ...explanation, config: display }, null, 2)}\n`
        : input.engine.renderExplain(explanation, { format: options.format }),
    )
    return 0
  } catch (error) {
    const message = error instanceof ExplainError ? error.message : `failed: ${messageOf(error)}`
    input.stderr(`repo-contract explain: ${message}\n`)
    return 1
  }
}
