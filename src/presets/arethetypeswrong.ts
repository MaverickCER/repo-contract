import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * attw's own `--format json` contract -- not published as a TypeScript type
 * by the tool. `problems` is a flat record keyed by problem kind (e.g.
 * "FalseCJS", "NoResolution"), each entry carrying whichever context fields
 * that kind of problem produces.
 */
export interface AttwReport {
  readonly problems?: Record<string, readonly AttwProblem[]>
}

export interface AttwProblem {
  readonly kind: string
  readonly entrypoint?: string
  readonly resolutionKind?: string
  readonly typesFileName?: string
  readonly implementationFileName?: string
}

/**
 * Renders one attw problem as a single human-readable line, appending whichever context fields (entrypoint, resolution kind, types/impl file names) that problem kind happens to carry.
 * @param problem - the attw problem to render.
 * @returns the rendered `kind: context...` line, or just the kind if it carries no context fields.
 */
function formatProblem(problem: AttwProblem): string {
  const context = [
    problem.entrypoint ? `entrypoint=${problem.entrypoint}` : undefined,
    problem.resolutionKind ? `resolution=${problem.resolutionKind}` : undefined,
    problem.typesFileName ? `types=${problem.typesFileName}` : undefined,
    problem.implementationFileName ? `impl=${problem.implementationFileName}` : undefined,
  ].filter((value): value is string => value !== undefined)

  return context.length > 0 ? `${problem.kind}: ${context.join(" ")}` : problem.kind
}

/**
 * Interprets an already-parsed attw JSON report -- exported (unlike this
 * package's other internal evaluators) because a repository whose package
 * has enough entrypoints to make attw's own `--format json` output exceed
 * ~64KB can hit a real, reproducible upstream bug: attw truncates its own
 * stdout when it's a pipe (confirmed independently of repo-contract, via
 * plain shell piping) rather than a TTY or regular file. Redirecting attw's
 * output to a file sidesteps that bug; a consumer doing so needs this same
 * interpretation logic without re-deriving it. repo-contract's own
 * `repo-contract.config.ts` does exactly this once it has more than one real
 * entrypoint (see that file's `arethetypeswrong` override).
 * @param report - the parsed attw JSON report to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateAttwReport(report: AttwReport): PolicyResult {
  const problems = Object.values(report.problems ?? {}).flat()

  if (problems.length === 0) {
    return {
      outcome: "pass",
      rationale: "@arethetypeswrong/cli found 0 packaged type-resolution problem(s).",
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `@arethetypeswrong/cli found ${String(problems.length)} packaged type-resolution problem(s):`,
      ...problems.map((problem) => `- ${formatProblem(problem)}`),
    ].join("\n"),
  }
}

// `--pack` runs `npm pack` against the current directory so this preset
// evaluates exactly what `files`/`exports` in package.json would ship, not
// the working tree directly. Relevant only to repositories that publish an
// npm package. Unlike repo-contract's own internal `arethetypeswrong` check,
// this preset does not exclude any entrypoint -- `--exclude-entrypoints` is
// specific to whichever of a consumer's own `exports` subpaths are
// non-code (e.g. a bare JSON schema export), so it's left as a `run`
// override for the consumer to add, rather than guessed at generically here.
/** Published-package type-resolution correctness via `@arethetypeswrong/cli`. */
export const arethetypeswrong: CheckDefinitionConfig = {
  run: ["attw", "--pack", ".", "--format", "json"],
  output: { format: "json" },
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "@arethetypeswrong/cli")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "@arethetypeswrong/cli")
    if (terminated) return terminated

    if (!result.output?.success) {
      return {
        outcome: "fail",
        rationale: "@arethetypeswrong/cli output could not be parsed as JSON.",
      }
    }

    return evaluateAttwReport(result.output.value as AttwReport)
  },
}
