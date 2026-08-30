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
 * The git commands a contributor runs to fix commit messages already on their branch. Appended
 * to every failure rationale so the fix is in the error itself, not a doc they have to go find.
 * @param from - the ref the rebase is based on (commitlint's own `--from`).
 * @returns the remediation block, leading with a blank line.
 */
function remediation(from: string): string {
  return [
    "",
    "Rewrite the offending commit message(s) already on this branch:",
    "",
    `  git rebase -i ${from}`,
    "",
    "In the editor, for each commit flagged above change `pick` to:",
    "  - `reword` to keep the commit but fix its message (a valid Conventional Commit:",
    "    `type(scope): subject`, lowercase type, no trailing period), or",
    "  - `squash` / `fixup` to fold it into the commit before it, or",
    "  - `drop` to remove the commit entirely.",
    "",
    "Then, if the branch is already pushed:",
    "",
    "  git push --force-with-lease",
  ].join("\n")
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
        rationale:
          exitCodeFailRationale(result, "commitlint reported commit message violations") +
          `\n${remediation(from)}`,
      }
    },
  }
}
