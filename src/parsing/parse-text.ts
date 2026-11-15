import type { ParsedOutput } from "../types.js"

/**
 * "Parses" `stdout` as text: a trimmed passthrough that always succeeds. It is an explicit
 * alternative to omitting `output`. With `format: "text"`, a consumer gets `result.output.value`
 * as a plain trimmed string instead of trimming `result.stdout` each time.
 * @param stdout - the check's raw stdout to trim.
 * @returns the always-successful result wrapping the trimmed string.
 */
export function parseText(stdout: string): ParsedOutput<string> {
  return { format: "text", success: true, value: stdout.trim() }
}
