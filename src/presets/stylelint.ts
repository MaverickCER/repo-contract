import type { CheckDefinitionConfig } from "../types.js"
import { combinedOutput } from "./shared/exit-code-fail-rationale.js"
import { errorWarningPassPolicy } from "./shared/error-warning-pass-policy.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** Stylelint's own `--formatter json` contract -- not published as a TypeScript type by the tool. */
interface StylelintWarning {
  readonly line: number
  readonly column: number
  readonly rule: string
  readonly severity: "error" | "warning"
  readonly text: string
}

interface StylelintResult {
  readonly source?: string
  readonly errored: boolean
  readonly warnings: readonly StylelintWarning[]
}

/** Options accepted by {@link stylelint}. */
interface StylelintOptions {
  /** Glob passed straight through to stylelint as its positional target. Defaults to `"**\/*.{css,scss}"` -- adjust it for your own stylesheet file extensions (e.g. `.less`, `.vue`, `.svelte`). */
  readonly glob?: string
}

/**
 * CSS/SCSS lint via stylelint, using whatever stylelint config the
 * consumer's own repository already has. `severity: "error"` blocks;
 * `severity: "warning"` is reported but never blocks, matching how the
 * `lint` preset treats ESLint's own severities.
 * @param options - configuration for this check; see {@link StylelintOptions}.
 * @returns the configured check.
 */
export function stylelint(options: StylelintOptions = {}): CheckDefinitionConfig {
  const { glob = "**/*.{css,scss}" } = options

  return {
    run: ["stylelint", glob, "--formatter", "json"],
    output: { format: "json" },
    policy: ({ result }) => {
      const missing = checkDependencyInstalled(result, "stylelint")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "stylelint")
      if (terminated) return terminated

      if (!result.output?.success) {
        // stylelint exits non-zero with no JSON on stdout when its glob
        // matched no stylesheets or its config failed to load. Surface what
        // it printed so a repo that legitimately has no CSS sees the real
        // cause rather than an opaque parse failure.
        const printed = combinedOutput(result)

        return {
          outcome: "fail",
          rationale:
            printed.length > 0
              ? `stylelint output could not be parsed as JSON. stylelint printed:\n${printed}`
              : "stylelint output could not be parsed as JSON.",
        }
      }

      const results = result.output.value as readonly StylelintResult[]

      const render = (file: StylelintResult, warning: StylelintWarning): string =>
        `${file.source ?? "<unknown file>"}:${String(warning.line)}:${String(warning.column)} [${warning.rule}]: ${warning.text}`

      const errorDetails = results.flatMap((file: StylelintResult): string[] =>
        file.warnings
          .filter((warning: StylelintWarning) => warning.severity === "error")
          .map((warning: StylelintWarning) => render(file, warning)),
      )

      const warningDetails = results.flatMap((file: StylelintResult): string[] =>
        file.warnings
          .filter((warning: StylelintWarning) => warning.severity === "warning")
          .map((warning: StylelintWarning) => render(file, warning)),
      )

      return errorWarningPassPolicy("stylelint", errorDetails, warningDetails)
    },
  }
}
