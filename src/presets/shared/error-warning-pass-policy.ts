import type { PolicyResult } from "../../types.js"

/**
 * The shared three-branch shape behind every lint-style preset's pass/warn/fail decision. It
 * fails, listing every error, if there are any; else warns, listing every warning, if there are
 * any; else passes. `lint` (ESLint) and `stylelint` share it: their only difference was the tool
 * name substituted into each rationale string.
 * @param toolName - the tool's own display name, substituted into every rationale (e.g. "ESLint", "stylelint").
 * @param errorDetails - one rendered line per error-severity finding.
 * @param warningDetails - one rendered line per warning-severity finding.
 * @returns the fail/warn/pass `PolicyResult`.
 */
export function errorWarningPassPolicy(
  toolName: string,
  errorDetails: readonly string[],
  warningDetails: readonly string[],
): PolicyResult {
  if (errorDetails.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `${toolName} reported ${String(errorDetails.length)} error(s):`,
        ...errorDetails.map((detail) => `- ${detail}`),
      ].join("\n"),
    }
  }

  if (warningDetails.length > 0) {
    return {
      outcome: "warn",
      rationale: [
        `${toolName} reported 0 errors but ${String(warningDetails.length)} warning(s):`,
        ...warningDetails.map((detail) => `- ${detail}`),
      ].join("\n"),
    }
  }

  return { outcome: "pass", rationale: `${toolName} reported 0 errors and 0 warnings.` }
}
