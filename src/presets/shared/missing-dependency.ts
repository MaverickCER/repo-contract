import type { CheckEvidence, PolicyResult } from "../../types.js"

/**
 * Every preset in `src/presets/*.ts` calls this first, before its
 * pass/fail/warn logic. The exception is `securityDeps`, which shells out to
 * `npm` itself: something that cannot be "missing" in any environment
 * capable of running `npm run <script>` at all. `CheckEvidence.status ===
 * "spawn_error"` already distinguishes "the OS couldn't even launch the
 * executable" from "the tool ran and exited non-zero". But not every spawn
 * failure means the package is missing (a permission error or an invalid
 * executable format lands here too). So this checks the structured
 * `spawnErrorCode` for `"ENOENT"`, not every spawn error.
 * A non-ENOENT spawn error falls through to the preset's normal handling,
 * unchanged. It never gets a misleading "not installed" message.
 * @param result - the check's raw execution evidence to inspect.
 * @param packageName - the npm package a consumer would install to fix this (may differ from the binary name, e.g. `tsc` comes from `typescript`).
 * @returns an actionable, package-manager-neutral `PolicyResult` if the tool appears to be missing, or `undefined` if the caller should proceed with its interpretation.
 */
export function checkDependencyInstalled(
  result: CheckEvidence,
  packageName: string,
): PolicyResult | undefined {
  if (result.status !== "spawn_error" || result.spawnErrorCode !== "ENOENT") {
    return undefined
  }

  return missingDependencyResult(packageName)
}

/**
 * The "not installed" verdict alone, for a preset that detects a missing tool without ENOENT.
 * The `license` preset runs licensee through `node`, so its missing tool is never ENOENT.
 * @param packageName - the npm package a consumer would install to fix this.
 * @returns the actionable, package-manager-neutral fail result.
 */
export function missingDependencyResult(packageName: string): PolicyResult {
  return {
    outcome: "fail",
    rationale: `\`${packageName}\` is required by this preset but was not found. Install \`${packageName}\` as a development dependency and run the contract again.`,
  }
}
