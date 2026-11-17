import type { PolicyResult } from "../../types.js"

/** The printed tail kept in a failing rationale. Enough for dozens of findings. */
const TAIL_LENGTH = 4000

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
  const { exitCode, output } = result

  if (exitCode === null) {
    return {
      outcome: "fail",
      rationale: "markdownlint-cli2 did not finish: it left no exit code.",
    }
  }

  if (exitCode === 0) {
    return { outcome: "pass", rationale: "markdownlint-cli2 reported 0 issues." }
  }

  // Older markdownlint-cli2 releases exit non-zero when the globs match nothing.
  if (output.includes("Linting: 0 file") || /no files/i.test(output)) {
    return { outcome: "pass", rationale: "markdownlint-cli2 found no Markdown files to lint." }
  }

  const description = `markdownlint-cli2 reported issues (exit code ${String(exitCode)})`
  return {
    outcome: "fail",
    rationale:
      output.length > 0 ? `${description}:\n${output.slice(-TAIL_LENGTH)}` : `${description}.`,
  }
}

/**
 * Builds markdownlint-cli2's arguments.
 * @param options - the `markdownlint` options that shape the run.
 * @param options.glob - the single glob, used when `globs` is absent.
 * @param options.globs - globs that replace `glob`.
 * @param options.config - a config file, passed as `--config`.
 * @returns `--config <file>` when set, then the globs.
 * @throws {RangeError} when `globs` is an empty list.
 */
export function markdownlintArguments(options: {
  readonly glob: string
  readonly globs?: readonly string[] | undefined
  readonly config?: string | undefined
}): readonly string[] {
  const { glob, globs, config } = options
  // With no globs, markdownlint-cli2 prints its help, lints nothing and exits 2.
  if (globs?.length === 0) {
    throw new RangeError("markdownlint: globs must name at least one glob.")
  }
  return [...(config === undefined ? [] : ["--config", config]), ...(globs ?? [glob])]
}
