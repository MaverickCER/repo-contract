import { notImplementedCheck } from "../not-implemented.js"
import type { CheckDefinitionConfig } from "../types.js"

/** Options accepted by {@link npmScript}. */
export interface NpmScriptOptions {
  /** The npm script to run. */
  readonly script: string
  /** The name rationales use. Defaults to the script name. */
  readonly label?: string
  /** When package.json has no such script: `"skip"` (the default) passes as not applicable; `"fail"` fails. */
  readonly whenMissing?: "skip" | "fail"
  /** Paths the script must leave byte-identical. Set them for a script that regenerates committed files: a change means the committed copy is stale. */
  readonly mustNotChange?: readonly string[]
  /** Time the script may take, in milliseconds. */
  readonly timeoutMs?: number
}

/**
 * Runs one of the package's own npm scripts as a check, through `repo-contract npm-script --json`.
 * Fails when the script exits non-zero, or changes a `mustNotChange` path.
 * @param options - configuration for this check; see {@link NpmScriptOptions}.
 * @returns the configured check.
 * @beta
 */
export function npmScript(options: NpmScriptOptions): CheckDefinitionConfig {
  return notImplementedCheck("R7b", options)
}
