// `mutation run --report`: whether a report made elsewhere, such as merged shards, is evidence
// about this checkout. It must hold every file this run would mutate, and each recorded source
// must match the text on disk.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { fileOfTarget } from "./mutation-plan.mjs"

/** The statuses Stryker gives a mutant. */
export const STATUSES = new Set([
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "CompileError",
  "RuntimeError",
  "Ignored",
  "Pending",
])

/**
 * Says what is wrong with a report's shape before anything judges it. A file with
 * `mutants: null` or a mutant without a status would otherwise be skipped, and a report could pass
 * having judged less than it appears to.
 * @param {unknown} report - A parsed report.
 * @returns {string | undefined} The problem, or `undefined` when the shape is sound.
 */
function reportShapeError(report) {
  const files = report?.files
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    return "it has no `files` object."
  }
  const names = Object.keys(files)
  if (names.length === 0) return "it has no file in it."
  for (const name of names) {
    const mutants = files[name]?.mutants
    if (!Array.isArray(mutants)) return `${name} has no \`mutants\` array.`
    const odd = mutants.find((mutant) => !STATUSES.has(mutant?.status))
    if (odd !== undefined) {
      return `${name} has a mutant whose status is ${JSON.stringify(odd?.status)}, which Stryker does not report.`
    }
  }
  return undefined
}

/**
 * A logger for Stryker's instrumenter that says nothing. Every method returns `undefined`, so each
 * `is*Enabled` check reads as off.
 */
const SILENT_LOGGER = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  isTraceEnabled: () => {},
  isDebugEnabled: () => {},
  isInfoEnabled: () => {},
  isWarnEnabled: () => {},
  isErrorEnabled: () => {},
  isFatalEnabled: () => {},
}

/** The instrumenter's options with Stryker's defaults: no ignorers, plugins or excluded mutators. */
const INSTRUMENT_OPTIONS = { ignorers: [], plugins: null, excludedMutations: [] }

/**
 * Which of some files Stryker's instrumenter finds no mutant in, over the text on disk. A report
 * has an entry for a file only when it placed a mutant there, so a module of re-exports is
 * mutated and still absent.
 * @param {string} cwd - The project.
 * @param {readonly string[]} files - Sources relative to the project.
 * @returns {Promise<string[]>} The files with no mutant.
 */
export async function mutantFreeFiles(cwd, files) {
  const require = createRequire(path.join(cwd, "package.json"))
  const { Instrumenter } = await import(
    pathToFileURL(require.resolve("@stryker-mutator/instrumenter")).href
  )
  const inputs = files.map((file) => ({
    name: path.join(cwd, file),
    content: readFileSync(path.join(cwd, file), "utf8"),
    mutate: true,
  }))
  const { mutants } = await new Instrumenter(SILENT_LOGGER).instrument(inputs, INSTRUMENT_OPTIONS)
  const placed = new Set(mutants.map((mutant) => mutant.fileName))
  return files.filter((file) => !placed.has(path.join(cwd, file)))
}

/** @param {string} text - A file's text. @returns {string} The text with `\n` line endings. */
const normalised = (text) => text.replace(/\r\n/g, "\n")

/**
 * Decides whether a report made elsewhere is evidence about this checkout. Every file this run
 * would mutate must be in it or hold no mutant, and no other file may be. Each recorded source
 * must be the text on disk. Slices from another revision or plan would otherwise judge other code.
 * @param {string} cwd - The project.
 * @param {string} name - The report, as given.
 * @param {readonly string[]} targets - What this run would mutate.
 * @param {(cwd: string, files: string[]) => Promise<string[]>} mutantFree - Which files hold no mutant.
 * @returns {Promise<string | undefined>} Why the report is refused, or `undefined`.
 */
export async function adoptionProblem(cwd, name, targets, mutantFree) {
  let report
  try {
    report = JSON.parse(String(readFileSync(path.resolve(cwd, name))))
  } catch (error) {
    return `${name} cannot be read as a mutation report (${error.message}).`
  }
  const shape = reportShapeError(report)
  if (shape !== undefined) return `${name} is not a mutation report: ${shape}`
  const expected = [...new Set(targets.map(fileOfTarget))].sort()
  const reported = Object.keys(report.files).sort()
  const absent = expected.filter((file) => !Object.hasOwn(report.files, file))
  let missing = absent
  if (absent.length > 0) {
    try {
      const free = new Set(await mutantFree(cwd, absent))
      missing = absent.filter((file) => !free.has(file))
    } catch (error) {
      return `${name} lacks ${absent.join(", ")}, and whether Stryker would mutate them could not be told: ${error.message}`
    }
  }
  const extra = reported.filter((file) => !expected.includes(file))
  if (missing.length > 0 || extra.length > 0) {
    const parts = [
      ...(missing.length > 0 ? [`it lacks ${missing.join(", ")}`] : []),
      ...(extra.length > 0 ? [`it has ${extra.join(", ")}, which this run does not mutate`] : []),
    ]
    return `${name} was not made from this checkout's plan: ${parts.join("; ")}.`
  }
  const changed = reported.filter((file) => {
    try {
      return (
        normalised(readFileSync(path.join(cwd, file), "utf8")) !==
        normalised(String(report.files[file].source))
      )
    } catch {
      return true
    }
  })
  if (changed.length > 0) {
    return `${name} was not made from this checkout: ${changed.join(", ")} differ${changed.length === 1 ? "s" : ""} from the text that was mutated.`
  }
  return undefined
}
