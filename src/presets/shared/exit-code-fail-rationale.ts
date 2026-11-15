import type { CheckEvidence } from "../../types.js"

/**
 * A check's captured stdout and stderr, trimmed and joined into one block. An empty stream is
 * dropped instead of adding a blank line. Shared by `exitCodeFailRationale` below and by
 * `publint`, which needs the combined text, not a rendered failure message, to detect its
 * "Warnings:"/"Suggestions:" section headers.
 * @param result - the check's execution evidence (only `stdout`/`stderr` are read).
 * @returns the combined, trimmed stdout+stderr text, or `""` if the tool produced neither.
 */
export function combinedOutput(result: CheckEvidence): string {
  return [result.stdout.trim(), result.stderr.trim()]
    .filter((value): value is string => Boolean(value))
    .join("\n")
}

/**
 * Shared by every preset whose policy is a plain "exitCode 0 = pass":
 * `format`, `typecheck`, `commitlint`. A failure renders the captured
 * stdout/stderr, or an exit-code-only message if the tool printed neither.
 * Each preset still owns its pass rationale and its description of what
 * failed; this renders only the shared "here's what the tool printed"
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
