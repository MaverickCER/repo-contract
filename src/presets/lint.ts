import type { CheckDefinitionConfig } from "../types.js"
import { combinedOutput } from "./shared/exit-code-fail-rationale.js"
import { errorWarningPassPolicy } from "./shared/error-warning-pass-policy.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * ESLint does not expose its JSON formatter result as a public LintResult
 * export -- these types describe the JSON formatter contract rather than
 * ESLint's internal Linter types.
 */
interface EslintMessage {
  readonly ruleId: string | null
  readonly severity: 0 | 1 | 2
  readonly message: string
  readonly line: number
  readonly column: number
}

interface EslintResult {
  readonly filePath: string
  readonly messages: readonly EslintMessage[]
  readonly errorCount: number
  readonly warningCount: number
}

/** Options accepted by {@link lint}. */
interface LintOptions {
  /** Path (or glob) passed straight through to ESLint as its positional target. Defaults to `"."` -- narrow it (e.g. `"src"`) to scope linting to your own source tree. */
  readonly path?: string
}

/**
 * Renders every message at the given severity across all files as one `file:line:column [rule]: message` line each.
 * @param results - the full ESLint JSON formatter result to filter and render.
 * @param severity - which severity to render (`2` for errors, `1` for warnings).
 * @returns one rendered line per matching message, across every file.
 */
function renderMessages(results: readonly EslintResult[], severity: 1 | 2): string[] {
  return results.flatMap((file: EslintResult): string[] =>
    file.messages
      .filter((message: EslintMessage) => message.severity === severity)
      .map((message: EslintMessage) => {
        const rule = message.ruleId ? ` [${message.ruleId}]` : ""

        return `${file.filePath}:${String(message.line)}:${String(message.column)}${rule}: ${message.message}`
      }),
  )
}

/**
 * Static analysis via ESLint, using whatever `eslint.config.js` the
 * consumer's own repository already has -- this preset makes no assumption
 * about rule configuration, only about how to run the tool and interpret
 * its JSON output. Severity `2` (error) blocks; severity `1` (warning) is
 * reported but never blocks -- ESLint's own severities already encode that
 * distinction, so this preset just respects it rather than treating every
 * finding as equally blocking.
 * @param options - configuration for this check; see {@link LintOptions}.
 * @returns the configured check.
 */
export function lint(options: LintOptions = {}): CheckDefinitionConfig {
  const { path = "." } = options

  return {
    run: ["eslint", path, "--format", "json"],
    output: { format: "json" },
    policy: ({ result }) => {
      const missing = checkDependencyInstalled(result, "eslint")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "ESLint")
      if (terminated) return terminated

      if (!result.output?.success) {
        // ESLint exits non-zero with no JSON on stdout both for a flat-config
        // load error and for a glob that matched no lintable files. Surface
        // whatever it printed so the consumer sees the real cause instead of
        // only "could not be parsed as JSON".
        const printed = combinedOutput(result)

        return {
          outcome: "fail",
          rationale:
            printed.length > 0
              ? `ESLint output could not be parsed as JSON. ESLint printed:\n${printed}`
              : "ESLint output could not be parsed as JSON.",
        }
      }

      // Valid JSON of an unexpected shape (an ESLint formatter change, a
      // primitive, a leading non-JSON line that still parses) must fail cleanly,
      // not throw a TypeError out of `renderMessages` -- matching the other JSON
      // presets' guards.
      const value: unknown = result.output.value
      if (!Array.isArray(value)) {
        return { outcome: "fail", rationale: "ESLint output could not be parsed as JSON." }
      }

      const results = value as readonly EslintResult[]

      const errorDetails = renderMessages(results, 2)
      const warningDetails = renderMessages(results, 1)

      return errorWarningPassPolicy("ESLint", errorDetails, warningDetails)
    },
  }
}
