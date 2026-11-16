import { notImplemented } from "../../not-implemented.js"
import type { PolicyResult } from "../../types.js"

/**
 * Judges markdownlint-cli2 by its exit code and printed output, for the `"exit-code"` verdict.
 * Exit 0 passes. A non-zero exit that linted no file passes: the globs matched nothing. Any other
 * non-zero exit fails with the printed findings.
 * @param result - what the run left.
 * @param result.exitCode - the exit code, `null` when the process did not exit.
 * @param result.output - stdout and stderr, combined.
 * @returns the verdict.
 */
export function judgeMarkdownlintExit(result: {
  readonly exitCode: number | null
  readonly output: string
}): PolicyResult {
  return notImplemented("R2", result)
}
