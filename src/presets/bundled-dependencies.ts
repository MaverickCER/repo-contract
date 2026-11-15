import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** npm reads both spellings of the bundling field. */
const FIELDS = ["bundleDependencies", "bundledDependencies"] as const

type ReaderReport =
  | { readonly readable: false; readonly error: string }
  | {
      readonly readable: true
      readonly fields: Readonly<Record<string, unknown>>
      readonly dependencies: readonly string[]
    }

/**
 * The reader executed by `node -e` in the working directory. It prints only the two bundling
 * fields as written and the names under `dependencies`, so the policy holds every judgement.
 */
const READER_SOURCE = `
const fs = require("node:fs")
function read() {
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync("package.json", "utf8"))
  } catch (error) {
    return { readable: false, error: error.message }
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return { readable: false, error: "package.json must contain a top-level object." }
  }
  const fields = {}
  for (const name of ${JSON.stringify(FIELDS)}) {
    if (Object.hasOwn(manifest, name)) fields[name] = manifest[name]
  }
  const declared = manifest.dependencies
  const dependencies =
    typeof declared === "object" && declared !== null && !Array.isArray(declared)
      ? Object.keys(declared)
      : []
  return { readable: true, fields, dependencies }
}
process.stdout.write(JSON.stringify(read()))
`

/**
 * Whether `value` has the shape the reader prints.
 * @param value - the parsed reader output.
 * @returns `true` when it is a well-formed reader report.
 */
function isReport(value: unknown): value is ReaderReport {
  // Parsed JSON is never `undefined`, and any other non-object fails the field checks below.
  if (value === null) return false
  const report = value as Record<string, unknown>
  if (report.readable === false) return typeof report.error === "string"
  return (
    report.readable === true &&
    typeof report.fields === "object" &&
    report.fields !== null &&
    !Array.isArray(report.fields) &&
    Array.isArray(report.dependencies) &&
    report.dependencies.every((name) => typeof name === "string")
  )
}

/**
 * The names one bundling field bundles.
 * @param value - the field as written in package.json.
 * @param dependencies - the names under `dependencies`.
 * @returns the bundled names, or `undefined` when the field is malformed.
 */
function bundledNames(
  value: unknown,
  dependencies: readonly string[],
): readonly string[] | undefined {
  if (value === true) return dependencies
  if (value === false) return []
  if (Array.isArray(value) && value.every((name) => typeof name === "string")) {
    return value
  }
  return undefined
}

/**
 * Judges a well-formed, readable report.
 * @param fields - the bundling fields as written.
 * @param dependencies - the names under `dependencies`.
 * @returns the verdict.
 */
function evaluate(
  fields: Readonly<Record<string, unknown>>,
  dependencies: readonly string[],
): PolicyResult {
  const declared = new Set(dependencies)
  const missing: string[] = []
  let bundledCount = 0
  for (const field of FIELDS) {
    if (!Object.hasOwn(fields, field)) continue
    const names = bundledNames(fields[field], dependencies)
    if (names === undefined) {
      return {
        outcome: "fail",
        rationale: `package.json "${field}" must be a list of package names or a boolean; got ${JSON.stringify(fields[field])}.`,
      }
    }
    bundledCount += names.length
    for (const name of names) {
      if (!declared.has(name)) missing.push(`- ${field}: ${JSON.stringify(name)}`)
    }
  }
  if (bundledCount === 0) {
    return { outcome: "pass", rationale: "package.json bundles no dependencies." }
  }
  if (missing.length === 0) {
    return {
      outcome: "pass",
      rationale: `All ${String(bundledCount)} bundled package(s) are declared in "dependencies".`,
    }
  }
  return {
    outcome: "fail",
    rationale: [
      `${String(missing.length)} bundled package(s) are missing from "dependencies". npm publishes each one into the registry manifest as "*", which supply-chain scanners such as Socket report as manifest confusion. Add each to "dependencies" at the version you bundle:`,
      ...missing,
    ].join("\n"),
  }
}

/**
 * Fails when package.json bundles a package (`bundleDependencies` or `bundledDependencies`) that
 * its `dependencies` do not declare. npm writes each such name into the published registry
 * manifest as `"*"`, and supply-chain scanners such as Socket report the mismatch as manifest
 * confusion. Passes a package that bundles nothing. Reads package.json in the working directory
 * with `node -e`; no external tool.
 * @beta
 */
export const bundledDependencies: CheckDefinitionConfig = {
  run: ["node", "-e", READER_SOURCE],
  output: { format: "json" },
  policy: ({ result }) => {
    const terminated = checkTerminatedAbnormally(result, "The package.json reader")
    if (terminated) return terminated

    if (!result.output?.success) {
      return {
        outcome: "fail",
        rationale: "The package.json reader's output could not be parsed as JSON.",
      }
    }
    const value: unknown = result.output.value
    if (!isReport(value)) {
      return { outcome: "fail", rationale: "The package.json reader produced an invalid report." }
    }
    if (!value.readable) {
      return { outcome: "fail", rationale: `package.json could not be read: ${value.error}` }
    }
    return evaluate(value.fields, value.dependencies)
  },
}
