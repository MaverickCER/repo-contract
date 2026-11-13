/**
 * Evidence shape printed to stdout by scripts/github-actions/lint.mjs (as JSON, for the
 * `github-actions` check's `output: { format: "json" }` to parse) and consumed by
 * checks/github-actions.ts's policy.
 *
 * The specialized analysis is owned by `actionlint` (rhysd/actionlint, run through the
 * `github-actionlint` npm wrapper). This repository owns only two things: whether that analysis
 * satisfies the contract, and how its result participates in the verdict. See
 * specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md.
 */

/** One actionlint finding, normalized from actionlint's own `-format '{{json .}}'` output. */
export interface ActionlintFinding {
  /** The human-readable explanation actionlint gives for the problem. */
  readonly message: string
  /** Path to the offending workflow file, relative to the repository root. */
  readonly file: string
  /** The 1-based line number of the offending syntax. */
  readonly line: number
  /** The 1-based column number of the offending syntax. */
  readonly column: number
  /** The rule category actionlint assigns to this finding (e.g. `"expression"`, `"syntax-check"`, `"shellcheck"`). */
  readonly kind: string
}

/**
 * `ok: false` means `actionlint` itself failed to run. Either its binary could not be downloaded
 * or executed, or it produced unparseable output. Such a tool-infrastructure failure is never
 * conflated with "actionlint ran and reported findings". This mirrors every other check's
 * `CheckStatus`/`ParsedOutput.success` distinction.
 */
export type GitHubActionsEvidence =
  | {
      readonly ok: true
      /** How many `.github/workflows/*.{yml,yaml}` files were handed to actionlint. */
      readonly filesScanned: number
      readonly findings: readonly ActionlintFinding[]
    }
  | {
      readonly ok: false
      readonly error: string
    }
