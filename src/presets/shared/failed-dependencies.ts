import type { CheckEvidence } from "../../types.js"

/**
 * Names the checks this one waits on that did not run to a zero exit. A check reading another
 * check's output stands down when that check failed: the failure is already red, and reading its
 * partial output would add a second, misleading one.
 * @param dependencies - the policy context's `dependencies`.
 * @returns the ids of the dependencies that failed, sorted.
 */
export function failedDependencies(
  dependencies: Readonly<Record<string, CheckEvidence>>,
): readonly string[] {
  return Object.entries(dependencies)
    .filter(([, evidence]) => evidence.status !== "completed" || evidence.exitCode !== 0)
    .map(([id]) => id)
    .sort()
}
