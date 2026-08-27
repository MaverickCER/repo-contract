import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"

/** Options accepted by {@link commitlint}. */
interface CommitlintOptions {
  /** The ref commitlint lints commits *from* (exclusive). Defaults to `"origin/main"`. */
  readonly from?: string
  /** The ref commitlint lints commits *to* (inclusive). Defaults to `"HEAD"`. */
  readonly to?: string
}

/**
 * Commit-message governance via commitlint, using whatever commitlint
 * config the consumer's own repository already has (commitlint ships no
 * rules of its own -- e.g. `@commitlint/config-conventional`). Exit-code
 * based rather than `--format json`: commitlint has no broadly-documented,
 * stable JSON CLI output, so this preset reads its plain-text report the
 * same way the `format`/`typecheck` presets already do for their tools,
 * rather than relying on an unconfirmed flag.
 * @param options - configuration for this check; see {@link CommitlintOptions}.
 * @returns the configured check.
 */
export function commitlint(options: CommitlintOptions = {}): CheckDefinitionConfig {
  const { from = "origin/main", to = "HEAD" } = options

  return {
    run: ["commitlint", "--from", from, "--to", to],
    policy: ({ result }) => {
      const missing = checkDependencyInstalled(result, "@commitlint/cli")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "commitlint")
      if (terminated) return terminated

      if (result.exitCode === 0) {
        return {
          outcome: "pass",
          rationale: `commitlint found 0 commit message violations between ${from} and ${to}.`,
        }
      }

      return {
        outcome: "fail",
        rationale: exitCodeFailRationale(result, "commitlint reported commit message violations"),
      }
    },
  }
}
