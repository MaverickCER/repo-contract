// `repo-contract mutation plan`, and what a run mutates: the Stryker config, its `mutate`
// patterns expanded to files and line ranges, and each file's size. A run cuts shards from the
// same sizes, so `plan` and `run --shard` agree on every slice.

import { existsSync, globSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const CONFIG_CANDIDATES = [
  "stryker.config.mjs",
  "stryker.config.js",
  "stryker.config.cjs",
  "stryker.config.json",
  "stryker.conf.mjs",
  "stryker.conf.js",
  "stryker.conf.cjs",
  "stryker.conf.json",
  ".stryker.conf.json",
]

/** The extensions Stryker mutates by default. */
const DEFAULT_EXTENSIONS = "+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)"

/** Stryker's own default `mutate`: sources under src/ and lib/, test files left out. */
const DEFAULT_MUTATE = [
  `{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).${DEFAULT_EXTENSIONS}`,
  `!{src,lib}/**/__tests__/**/*.${DEFAULT_EXTENSIONS}`,
]

/**
 * Finds and loads the Stryker config.
 * @param {string} cwd - The project.
 * @param {string | undefined} option - `--config`, if given.
 * @returns {Promise<{ ok: true, file: string, config: Record<string, unknown> } | { ok: false, error: string }>}
 *   The config and its path relative to the project, or why it cannot be loaded.
 */
export async function loadStrykerConfig(cwd, option) {
  const file = option ?? CONFIG_CANDIDATES.find((name) => existsSync(path.join(cwd, name)))
  if (file === undefined) {
    return {
      ok: false,
      error:
        "no Stryker config found: pass --config, or add stryker.config.mjs (or .js, .cjs, .json, or stryker.conf.*)",
    }
  }
  const absolute = path.resolve(cwd, file)
  try {
    const config = absolute.endsWith(".json")
      ? JSON.parse(String(readFileSync(absolute)))
      : await import(pathToFileURL(absolute).href).then((loaded) => loaded.default ?? loaded)
    if (typeof config !== "object" || config === null) {
      return { ok: false, error: `${file} does not export a Stryker config object` }
    }
    return { ok: true, file, config }
  } catch (error) {
    return { ok: false, error: `cannot load ${file}: ${error.message}` }
  }
}

/** A line range after a file in a `mutate` entry: `:1-10`, `:1:5-10:20`. */
const RANGE = /^(.*?)(:\d+(?::\d+)?-\d+(?::\d+)?)$/

/**
 * @param {string} entry - A `mutate` entry, with or without a line range.
 * @returns {{ file: string, range: string }} The file part, and the range (`""` without one).
 */
function splitRange(entry) {
  const match = RANGE.exec(entry)
  return match === null ? { file: entry, range: "" } : { file: match[1], range: match[2] }
}

/**
 * @param {string} target - A target from {@link expandMutate}.
 * @returns {string} The file it is in.
 */
export const fileOfTarget = (target) => splitRange(target.split(",")[0]).file

/**
 * Lists what Stryker would mutate. Each pattern adds the files it matches; a `!` pattern removes
 * what it matches from what came before. A pattern may carry a line range; the file is then
 * mutated only there, unless another pattern names it whole.
 * @param {string} cwd - The project.
 * @param {readonly string[]} patterns - Stryker `mutate` patterns.
 * @returns {string[]} One target per file, in the order found: the file, or its ranges joined by
 *   commas. Every reader sorts them itself.
 */
function expandMutate(cwd, patterns) {
  /** @type {Map<string, string[] | null>} */
  const ranges = new Map()
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      // globSync, not path.matchesGlob: matchesGlob needs Node 22.5, and `engines` promises 22.0.
      for (const match of globSync(pattern.slice(1), { cwd })) {
        ranges.delete(match.split(path.sep).join("/"))
      }
      continue
    }
    const { file: glob, range } = splitRange(pattern)
    for (const match of globSync(glob, { cwd })) {
      if (!statSync(path.join(cwd, match)).isFile()) continue
      const file = match.split(path.sep).join("/")
      const held = ranges.get(file)
      if (range === "") ranges.set(file, null)
      else if (held === undefined) ranges.set(file, [range])
      else if (held !== null) held.push(range)
    }
  }
  return [...ranges.keys()].map(
    (file) =>
      ranges
        .get(file)
        ?.map((range) => `${file}${range}`)
        .join(",") ?? file,
  )
}

/**
 * @param {string} cwd - The project.
 * @param {Record<string, unknown>} config - The Stryker config.
 * @returns {string[]} What a full run mutates.
 */
export const targetsOf = (cwd, config) =>
  expandMutate(cwd, Array.isArray(config.mutate) ? config.mutate : DEFAULT_MUTATE)

/**
 * @param {string} cwd - The project.
 * @param {readonly string[]} targets - Mutation targets.
 * @returns {{ path: string, bytes: number }[]} Each target with its file's size.
 */
export const sized = (cwd, targets) =>
  targets.map((target) => ({
    path: target,
    bytes: statSync(path.join(cwd, fileOfTarget(target))).size,
  }))

/**
 * Runs `mutation plan`.
 * @param {Record<string, any>} input - The command's input.
 * @param {{ json: boolean, config?: string }} options - The parsed options.
 * @param {string} cwd - The project.
 * @returns {Promise<number>} The exit status.
 */
export async function runPlan(input, options, cwd) {
  const fail = (message) => {
    input.stderr(`repo-contract mutation: ${message}\n`)
    return 1
  }
  const loaded = await loadStrykerConfig(cwd, options.config)
  if (!loaded.ok) return fail(loaded.error)
  const targets = targetsOf(cwd, loaded.config)
  if (targets.length === 0) return fail(`${loaded.file} selects no file to mutate`)
  const plan = input.affected.planMutationShards(sized(cwd, targets))
  if (options.json) {
    const report = {
      schemaVersion: 1,
      config: loaded.file,
      files: plan.files,
      bytes: plan.bytes,
      count: plan.count,
      shards: plan.plan.shards,
      matrix: plan.matrix,
    }
    input.stdout(`${JSON.stringify(report)}\n`)
  } else {
    input.stdout(
      [
        `${loaded.file} mutates ${String(plan.files)} file(s), ${String(plan.bytes)} bytes: ${String(plan.count)} shard(s).`,
        ...plan.plan.shards.map(
          (files, index) => `  ${String(index + 1)}/${String(plan.count)}: ${files.join(" ")}`,
        ),
        "",
      ].join("\n"),
    )
  }
  return 0
}
