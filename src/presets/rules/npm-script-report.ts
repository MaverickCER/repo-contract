import { notImplemented } from "../../not-implemented.js"
import type { PolicyResult } from "../../types.js"

/** What `repo-contract npm-script --json` prints. */
export interface NpmScriptReport {
  readonly schemaVersion: 1
  readonly script: string
  /** `missing` when package.json has no such script; the script did not run. */
  readonly state: "ran" | "missing"
  readonly exitCode: number | null
  readonly timedOut: boolean
  /** `mustNotChange` paths whose content the script changed. */
  readonly changed: readonly string[]
  /** The last lines the script printed. */
  readonly output: string
}

/**
 * @param value - the parsed output of `repo-contract npm-script --json`.
 * @param options - how to word and judge it.
 * @param options.label - the name rationales use.
 * @param options.whenMissing - what a missing script means.
 * @returns the verdict.
 */
export function evaluateNpmScriptReport(
  value: unknown,
  options: { readonly label: string; readonly whenMissing: "skip" | "fail" },
): PolicyResult {
  return notImplemented("R7b", value, options)
}
