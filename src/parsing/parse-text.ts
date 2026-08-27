import type { ParsedOutput } from "../types.js"

/**
 * "Parses" `stdout` as text -- a trimmed passthrough that always succeeds. Exists as an explicit, self-documenting alternative to omitting `output` entirely: `format: "text"` gives a consumer `result.output.value` as a plain trimmed string, rather than needing to read `result.stdout` and trim it themselves every time.
 * @param stdout - the check's raw stdout to trim.
 * @returns the always-successful result wrapping the trimmed string.
 */
export function parseText(stdout: string): ParsedOutput<string> {
  return { format: "text", success: true, value: stdout.trim() }
}
