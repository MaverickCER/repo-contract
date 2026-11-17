/** A module resolution attw judges a package under. */
export type AttwResolutionKind = "node10" | "node16-cjs" | "node16-esm" | "bundler"

/** Every resolution attw judges, in its own order. */
const RESOLUTION_KINDS: readonly AttwResolutionKind[] = [
  "node10",
  "node16-cjs",
  "node16-esm",
  "bundler",
]

/**
 * Checks the resolutions to ignore when the config loads. A misspelt name would otherwise ignore
 * nothing and pass silently.
 * @param kinds - the `arethetypeswrong` `ignoreResolutions` option.
 * @returns the same list.
 * @throws {RangeError} naming the first value attw does not use.
 */
export function checkResolutionKinds(
  kinds: readonly AttwResolutionKind[],
): readonly AttwResolutionKind[] {
  const unknown = kinds.find((kind) => !RESOLUTION_KINDS.includes(kind))
  if (unknown !== undefined) {
    throw new RangeError(
      `arethetypeswrong: ignoreResolutions accepts "node10", "node16-cjs", "node16-esm" and "bundler", got ${JSON.stringify(unknown)}.`,
    )
  }
  return kinds
}

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
  if (kinds.length === 0 || typeof report !== "object" || report === null) return report
  const problems = (report as { problems?: unknown }).problems
  if (typeof problems !== "object" || problems === null) return report

  const ignored = new Set<unknown>(kinds)
  const kept: Record<string, unknown> = {}
  for (const [kind, group] of Object.entries(problems)) {
    // A non-array group is kept as it is: the evaluator owns judging a malformed report.
    if (!Array.isArray(group)) {
      kept[kind] = group
      continue
    }
    const remaining = group.filter(
      (problem: unknown) =>
        typeof problem !== "object" ||
        problem === null ||
        !ignored.has((problem as { resolutionKind?: unknown }).resolutionKind),
    )
    if (remaining.length > 0) kept[kind] = remaining
  }
  return { ...report, problems: kept }
}
