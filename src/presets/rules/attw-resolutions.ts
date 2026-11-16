import { notImplemented } from "../../not-implemented.js"
import type { AttwResolutionKind } from "../arethetypeswrong.js"

/**
 * Drops the problems found under the given resolutions from a parsed attw report, before
 * `evaluateAttwReport` judges it. A report of an unexpected shape comes back unchanged, so the
 * evaluator still fails it cleanly.
 * @param report - the parsed attw JSON.
 * @param kinds - the resolutions to ignore.
 * @returns the report without those problems.
 */
export function dropResolutionProblems(
  report: unknown,
  kinds: readonly AttwResolutionKind[],
): unknown {
  return notImplemented("R2", report, kinds)
}
