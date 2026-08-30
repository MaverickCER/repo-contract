import type { PolicyResult } from "../../types.js"

/**
 * The shared three-branch shape behind every lint-style preset's pass/warn/fail decision: fail,
 * listing every error, if there are any; else warn, listing every warning, if there are any; else
 * pass -- shared by `lint` (ESLint) and `stylelint`, whose only difference was the tool name
 * substituted into each rationale string.
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
