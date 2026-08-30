import type { CheckEvidence } from "../../types.js"

/**
 * A check's captured stdout and stderr, trimmed and joined into one block -- either stream may be
 * empty and is dropped rather than contributing a blank line. Shared by `exitCodeFailRationale`
 * below and by `publint` (which needs the combined text itself, not just a rendered failure
 * message, to detect its own "Warnings:"/"Suggestions:" section headers).
 * @param result - the check's execution evidence (only `stdout`/`stderr` are read).
 * @returns the combined, trimmed stdout+stderr text, or `""` if the tool produced neither.
 */
export function combinedOutput(result: CheckEvidence): string {
  return [result.stdout.trim(), result.stderr.trim()]
    .filter((value): value is string => Boolean(value))
    .join("\n")
}

/**
 * Shared by every preset whose policy is a plain "exitCode 0 = pass, else
 * render captured stdout/stderr (or fall back to an exit-code-only message
 * if the tool produced neither)" -- `format`, `typecheck`, `commitlint`.
 * Each preset still owns its own pass rationale and its own description of
 * what failed; this only renders the shared "here's what the tool printed"
 * half.
 * @param result - the check's execution evidence (only `stdout`/`stderr`/`exitCode` are read).
 * @param description - a present-tense description of the failure, e.g. "Prettier reported formatting failures".
 * @returns `"{description}:\n{output}"` when the tool produced output, or `"{description} (exit code {N})."` otherwise.
 */
export function exitCodeFailRationale(result: CheckEvidence, description: string): string {
  const output = combinedOutput(result)

  return output.length > 0
    ? `${description}:\n${output}`
    : `${description} (exit code ${String(result.exitCode)}).`
}
