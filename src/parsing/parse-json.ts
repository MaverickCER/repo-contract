import type { ParsedOutput } from "../types.js"

/**
 * Parses `stdout` as JSON. A malformed-JSON failure never throws, and the raw stdout stays
 * unchanged on the caller's `CheckEvidence`. The failure is reported as data, per repo-contract's
 * contract: "parsing failures are deterministic evidence, never a silent reinterpretation".
 * @param stdout - the check's raw stdout to parse as JSON.
 * @returns the parsed value on success, or the unparsed failure with `stdout` preserved.
 */
export function parseJson(stdout: string): ParsedOutput<unknown> {
  try {
    return { format: "json", success: true, value: JSON.parse(stdout) }
  } catch (error) {
    return {
      format: "json",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
