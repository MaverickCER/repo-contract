import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * Knip does not expose the serialized JSON reporter result as a public
 * TypeScript type, so the local evidence type below intentionally models
 * that JSON contract. The policy reports the actual issue category and name
 * instead of only returning an issue count.
 */
interface KnipIssueEntry {
  readonly name: string
  readonly line?: number
  readonly col?: number
  readonly pos?: number
}

interface KnipIssue {
  readonly file: string
  readonly dependencies?: readonly KnipIssueEntry[]
  readonly devDependencies?: readonly KnipIssueEntry[]
  readonly unlisted?: readonly KnipIssueEntry[]
  readonly unresolved?: readonly KnipIssueEntry[]
  readonly exports?: readonly KnipIssueEntry[]
  readonly types?: readonly KnipIssueEntry[]
  readonly binaries?: readonly KnipIssueEntry[]
  readonly duplicates?: readonly KnipIssueEntry[]
  readonly cycles?: readonly KnipIssueEntry[]
  readonly files?: readonly KnipIssueEntry[]
}

interface KnipReport {
  readonly issues: readonly KnipIssue[]
  readonly files: readonly string[]
}

/** Options accepted by {@link deadCode}. */
interface DeadCodeOptions {
  /**
   * devDependency names to exclude from the "unused devDependency" issue
   * category -- e.g. CLI tools knip has no way to see are used, because
   * nothing `import`s them. Round-tripped through knip's own
   * `--reporter-options` flag (see `readReporterOptions`) rather than kept in
   * a closure, so the exempt list this check actually ran with is visible on
   * the recorded command line and in persisted evidence, not just in this
   * file's source. Defaults to an empty list -- repo-contract ships no
   * built-in exemptions; add your own repository's here.
   */
  readonly exemptUnusedDevDependencies?: readonly string[]
}

/**
 * Recovers the JSON payload knip's own `--reporter-options` flag was invoked
 * with, if any. This is how `deadCode`'s exempt list gets from `run` back
 * into the policy purely via `result.args` -- see {@link DeadCodeOptions}.
 * @param args - the exact argv the check's command was spawned with (`CheckEvidence.args`).
 * @returns the parsed `--reporter-options` payload, or `undefined` if the flag is absent or its value isn't valid JSON.
 */
function readReporterOptions(args: readonly string[]): DeadCodeOptions | undefined {
  const flagIndex = args.indexOf("--reporter-options")
  const raw = flagIndex === -1 ? undefined : args[flagIndex + 1]

  // Provably equivalent, not a coverage gap: `JSON.parse(undefined)` (what
  // happens if this guard is removed or forced false) always throws
  // ("undefined" is not valid JSON, confirmed empirically), which the catch
  // block below already converts back to `undefined` -- the exact same
  // observable result this early return produces. Kept for clarity (avoids
  // relying on that throw-and-catch as the mechanism), not for behavior no
  // test can otherwise reach.
  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement -- JSON.parse(undefined) always throws, and the catch block below already converts that back to undefined, the same result this early return produces
  if (raw === undefined) {
    return undefined
  }

  // Provably equivalent, not a coverage gap: the catch block below is the
  // last statement in the function, so an empty block there falls off the
  // end and implicitly returns `undefined` anyway -- identical to its
  // explicit `return undefined`. Kept for clarity, not for behavior no
  // test can otherwise reach.
  // Stryker disable BlockStatement -- an empty catch block falls off the end of the function and implicitly returns undefined, identical to its explicit return
  try {
    return JSON.parse(raw) as DeadCodeOptions
  } catch {
    return undefined
  }
  // Stryker restore all
}

/**
 * Dead/unused-code detection via knip.
 * @param options - configuration for this check; see {@link DeadCodeOptions}.
 * @returns the configured check.
 */
export function deadCode(options: DeadCodeOptions = {}): CheckDefinitionConfig {
  const { exemptUnusedDevDependencies = [] } = options

  return {
    run: [
      "knip",
      "--reporter",
      "json",
      "--reporter-options",
      JSON.stringify({ exemptUnusedDevDependencies } satisfies DeadCodeOptions),
    ],
    output: { format: "json" },
    policy: ({ result }) => {
      const missing = checkDependencyInstalled(result, "knip")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "Knip")
      if (terminated) return terminated

      if (!result.output?.success) {
        return { outcome: "fail", rationale: "Knip output could not be parsed as JSON." }
      }

      const report = result.output.value as KnipReport

      if (!Array.isArray(report.issues) || !Array.isArray(report.files)) {
        return { outcome: "fail", rationale: "Knip produced invalid JSON report data." }
      }

      // Re-annotated rather than used directly: `Array.isArray` narrows its
      // argument to `any[]` regardless of the checked value's declared type (a
      // long-standing TypeScript limitation), so `report.issues`/`report.files`
      // would otherwise silently lose their element types below.
      const issues: readonly KnipIssue[] = report.issues
      const files: readonly string[] = report.files

      const exemptDevDependencies = new Set(
        readReporterOptions(result.args)?.exemptUnusedDevDependencies ?? [],
      )

      const details: string[] = []

      for (const issue of issues) {
        const addEntries = (
          label: string,
          entries: readonly KnipIssueEntry[] | undefined,
          ignored: ReadonlySet<string> = new Set(),
        ): void => {
          for (const entry of entries ?? []) {
            if (ignored.has(entry.name)) {
              continue
            }

            const location =
              typeof entry.line === "number"
                ? `:${String(entry.line)}:${String(entry.col ?? 1)}`
                : ""

            details.push(`${issue.file}${location} — ${label}: ${entry.name}`)
          }
        }

        addEntries("unused dependency", issue.dependencies)
        addEntries("unused devDependency", issue.devDependencies, exemptDevDependencies)
        addEntries("unlisted dependency", issue.unlisted)
        addEntries("unresolved import", issue.unresolved)
        addEntries("unused export", issue.exports)
        addEntries("unused type", issue.types)
        addEntries("unused binary", issue.binaries)
        addEntries("duplicate export", issue.duplicates)
        addEntries("circular dependency", issue.cycles)
        addEntries("unused file", issue.files)
      }

      for (const file of files) {
        details.push(`${file} — unused file`)
      }

      if (details.length === 0) {
        return { outcome: "pass", rationale: "Knip reported 0 issues." }
      }

      return {
        outcome: "fail",
        rationale: [
          `Knip reported ${String(details.length)} issue(s):`,
          ...details.map((detail: string) => `- ${detail}`),
        ].join("\n"),
      }
    },
  }
}
