// `mutation run --cache`: the key a run is stored under, and which runs may be stored. Only a
// clean run is kept, so a replay never repeats a survivor or a timeout.

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export const CACHE_DIRECTORY = ".repo-contract/cache"

export const CACHE_CHECK = "mutation"

/** The statuses a cached run may hold: caught, or never a mutant of the code at all. */
const CLEAN = new Set(["Killed", "Ignored", "RuntimeError", "CompileError"])

/**
 * @param {string} text - Bytes or text.
 * @returns {string} Its SHA-256, in hex.
 */
const digest = (text) => createHash("sha256").update(text).digest("hex")

/**
 * @param {any} report - A parsed report.
 * @returns {boolean} Whether it has mutants and every one was caught or left out. A survivor or a
 *   timeout may be a loaded machine's result, and replaying it would pin that.
 */
export function isClean(report) {
  const mutants = Object.values(report?.files ?? {}).flatMap((entry) => entry?.mutants ?? [])
  return mutants.length > 0 && mutants.every((mutant) => CLEAN.has(String(mutant?.status)))
}

/**
 * The cache key of a run: every file git lists, the resolved Stryker config, the Node.js version
 * and the restriction. What it cannot see: ignored files, and installed packages beyond what the
 * lockfile pins.
 * @param {object} key - What the key is built from.
 * @param {string} key.cwd - The project.
 * @param {(args: string[], dir: string) => Promise<string | undefined>} key.git - Runs git in a directory.
 * @param {Record<string, unknown>} key.config - The loaded Stryker config.
 * @param {string} key.restriction - What the run is restricted to, `""` for everything.
 * @param {readonly string[]} key.generated - Paths the run writes, never inputs to it.
 * @param {object} key.affected - The engine, for `cacheKey`.
 * @returns {Promise<{ key: string, inputs: Record<string, string> } | undefined>} The key, or
 *   `undefined` when git cannot list the files.
 */
export async function cacheInputs({ cwd, git, config, restriction, generated, affected }) {
  const listed = await git(["ls-files", "-co", "--exclude-standard", "-z"], cwd).catch(
    () => undefined,
  )
  if (listed === undefined) return undefined
  const isGenerated = (file) =>
    generated.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
  const inputs = {}
  for (const file of listed.split("\0").filter((name) => name !== "" && !isGenerated(name))) {
    // A file git lists but the checkout deleted is no input.
    if (existsSync(path.join(cwd, file))) inputs[file] = digest(readFileSync(path.join(cwd, file)))
  }
  inputs["(stryker config)"] = digest(JSON.stringify(config))
  inputs["(restriction)"] = digest(restriction)
  const key = affected.cacheKey({ check: CACHE_CHECK, inputs, tools: { node: process.version } })
  return { key, inputs }
}
