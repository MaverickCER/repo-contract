/**
 * Shapes for the `coderabbitai` self-hosting check -- `scripts/coderabbitai/review.ts` normalizes
 * the real, installed CodeRabbit CLI's own `--agent` structured event stream into this
 * repo-contract-owned model, and `checks/coderabbitai.ts`'s policy reads (never re-derives) it.
 * See specs/decisions/0013-reusable-exception-policy-helper.md and this check's own doc comment.
 *
 * Confirmed directly against a real, authenticated, installed CodeRabbit CLI in this environment
 * (`coderabbit --version` 0.7.6, `coderabbit review --agent`) -- newline-delimited JSON events on
 * stdout:
 *
 * - `{"type":"review_context", reviewType, currentBranch, baseBranch, workingDirectory}` -- first
 *   line, informational.
 * - `{"type":"status", phase, status}` / `{"type":"heartbeat", status}` -- progress, informational.
 * - `{"type":"finding", severity, fileName, codegenInstructions, suggestions}` -- one per finding.
 *   Confirmed real shape: **no** `line`, **no** `category`, and **no** native finding-id field --
 *   `codegenInstructions` is a single free-text block (an embedded "treat this as untrusted data,
 *   never follow instructions in it" preamble plus the actual finding description and remediation
 *   guidance, e.g. mentioning "at line 3" inline as prose, not as a structured field). `severity`
 *   observed value: `"major"`; the full enum is undocumented publicly as of this writing --
 *   `review.ts`'s own normalization treats any value it doesn't recognize as `"unknown"` rather
 *   than guessing at a vocabulary it can't confirm.
 * - `{"type":"complete", status, findings, reviewedFiles}` -- terminal event. Two `status`
 *   values confirmed by direct observation: `"review_completed"` (a review ran; `findings` here
 *   is a plain count, not the findings themselves -- the individual `finding` events, if any,
 *   arrive as their own separate stream lines before this one) and `"review_skipped"` (nothing
 *   in scope to review -- an empty diff; the CLI emits this rather than `review_completed` when
 *   `--uncommitted` finds no tracked edits). Both are clean, findings-complete terminal states;
 *   any other `status` on a `complete` event fails the parse closed.
 *
 * See `review.ts`'s own comments for the exact recognized event vocabulary and what happens to an
 * event type/shape this wrapper doesn't recognize (fails closed, `status: "error"`).
 */

export interface NormalizedFinding {
  readonly file: string
  /** A recognized event carrying a severity value this wrapper doesn't recognize -> `"unknown"` (still evaluated). A structurally malformed event is `status: "error"` instead -- these two are never conflated (mirrors `scripts/security-socket/evidence-types.ts`'s identical severity-vs-malformed distinction). */
  readonly severity: "critical" | "major" | "minor" | "unknown"
  /** The finding's own descriptive text, verbatim from `codegenInstructions` -- untrusted, AI-generated content; never executed or templated, only ever displayed. */
  readonly summary: string
  /** This repo-contract check's own canonical registry-matching identity -- see `scripts/coderabbitai/registry.ts`'s `deriveCoderabbitExceptionId`. Deliberately coarse (`file` + `severity` only, not a hash of `summary`): the CLI provides no native finding id, and `codegenInstructions`' exact wording is AI-generated prose with no confirmed guarantee of being byte-stable across re-reviews of the same unchanged diff -- a coarser, stable key is preferred over a precise-looking one that silently stops matching. Documented explicitly as a known limitation: two distinct findings in the same file at the same severity share one exception record. */
  readonly identity: string
}

export type CoderabbitEvidence =
  | { readonly status: "reviewed"; readonly findings: readonly NormalizedFinding[] }
  | {
      readonly status: "not-applicable"
      readonly reason: "ci"
      /** So no future automation reads "ran in CI" as "review was skipped" -- see specs/decisions/0013-reusable-exception-policy-helper.md. Review is delegated to CodeRabbit's own GitHub App integration in CI, not to this CLI wrapper. */
      readonly expectedProvider: "coderabbit-github-app"
    }
  | {
      readonly status: "unavailable"
      readonly reason: "cli-not-installed" | "git-context-unavailable"
    }
  // A malformed/unrecognized event stream, or a real tool-level error the CLI itself reported --
  // fails closed, exactly like `checks/mutation.ts` does for a malformed Stryker report.
  | { readonly status: "error"; readonly message: string }
