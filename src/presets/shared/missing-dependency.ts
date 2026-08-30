import type { CheckEvidence, PolicyResult } from "../../types.js"

/**
 * Every preset in `src/presets/*.ts` (except `securityDeps`, which shells out
 * to `npm` itself -- something that cannot be "missing" in any environment
 * capable of running `npm run <script>` at all) calls this first, before its
 * own pass/fail/warn logic. `CheckEvidence.status === "spawn_error"` already
 * distinguishes "the OS couldn't even launch the executable" from "the tool
 * ran and exited non-zero" -- but not every spawn failure means the package
 * is missing (a permission error or an invalid executable format lands here
 * too), so this checks the structured `spawnErrorCode` for `"ENOENT"`
 * specifically rather than treating every spawn error as "not installed."
 * A non-ENOENT spawn error falls through to the preset's normal handling,
 * unchanged, rather than getting a misleading "not installed" message.
 * @param result - the check's raw execution evidence to inspect.
 * @param packageName - the npm package a consumer would install to fix this (may differ from the binary name, e.g. `tsc` comes from `typescript`).
 * @returns an actionable, package-manager-neutral `PolicyResult` if the tool appears to be missing, or `undefined` if the caller should proceed with its own interpretation.
 */
export function checkDependencyInstalled(
  result: CheckEvidence,
  packageName: string,
): PolicyResult | undefined {
  if (result.status !== "spawn_error" || result.spawnErrorCode !== "ENOENT") {
    return undefined
  }

  return {
    outcome: "fail",
    rationale: `\`${packageName}\` is required by this preset but was not found. Install \`${packageName}\` as a development dependency and run the contract again.`,
  }
}
