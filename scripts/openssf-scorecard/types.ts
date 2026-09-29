/**
 * Shared shape every OpenSSF Scorecard-informed sub-check evaluator in this
 * directory returns. Deliberately mirrors the real `scorecard` CLI's own
 * output shape (a 0-10 integer score, or -1 for "could not be determined")
 * -- see scripts/openssf-scorecard/README.md for why this is repo-contract's
 * own evaluation, informed by OpenSSF Scorecard's published methodology
 * (https://github.com/ossf/scorecard/blob/main/docs/checks.md, Apache-2.0),
 * and NOT a run of the upstream `scorecard` binary. That distinction matters
 * for the "not a certification, not a reproduction" disclaimer this evidence
 * ultimately feeds.
 */
export interface ScorecardCheckResult {
  /** The Scorecard check name this evaluates, e.g. "Branch-Protection" -- exact upstream naming, so a reader can cross-reference https://github.com/ossf/scorecard/blob/main/docs/checks.md directly. */
  readonly name: string
  /** 0-10, matching upstream's scale, or `"not-applicable"` when this repository doesn't meet the check's own applicability precondition (e.g. Maintained requires the repo to be >90 days old) -- never coerced to 0, which would misrepresent "not yet assessable" as "failing". */
  readonly score: number | "not-applicable"
  /** One-line summary of why this score, referencing the specific evidence (a file, an API field, a count) that produced it. */
  readonly reason: string
  /** Supporting detail lines, empty if `reason` is already complete. */
  readonly details: readonly string[]
}

/**
 * Provenance metadata for one evaluation run, recorded alongside its
 * results so a reader of `docs/OpenSSF-Scorecard.md` (or this check's own
 * rationale) can tell exactly when, against what, and by which version of
 * this evaluator, a given score was produced -- without that requiring a
 * fresh run to reconstruct.
 */
export interface ScorecardProvenance {
  /** ISO 8601 timestamp of when this evaluation ran. */
  readonly date: string
  readonly repo: {
    /** The `owner/repo` slug this evaluation ran against (`gh-api.ts`'s `repoSlug()`). */
    readonly name: string
    /** The full commit SHA checked out when this evaluation ran (`scripts/diff-files.ts`'s `runGit(["rev-parse", "HEAD"], root)`). */
    readonly commit: string
  }
  readonly scorecard: {
    /**
     * repo-contract's own `package.json` version -- **this evaluator's own
     * version, never the upstream `scorecard` binary's** (this evaluation
     * never runs that binary at all; see this file's own module doc comment
     * for that same disclaimer). Any rendering of this field must keep that
     * distinction explicit, not just print a bare version number.
     */
    readonly version: string
    /**
     * The commit repo-contract itself was built from when this evaluation
     * ran. Sourced from the exact same `runGit(["rev-parse", "HEAD"])` call
     * as `repo.commit` above -- repo-contract evaluates its own repository,
     * so today the two values are always identical -- but kept as its own
     * field because it answers a different question: "what version of the
     * evaluator* produced this document" versus "what commit was
     * evaluated*". A consumer that vendored this evaluator to assess a
     * different target repository would see these two diverge.
     */
    readonly commit: string
  }
}

export type GhApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      /** `"unavailable"`: the `gh` CLI isn't installed or isn't authenticated -- every gh-API-backed check reports `"not-applicable"` for this reason, never a fail, matching security-socket's identical "can't distinguish genuinely-clean from never-ran" reasoning. `"not-found"`: a real 404 (e.g. no branch protection configured) -- the caller decides what that means for its own check. `"error"`: anything else. */
      readonly reason: "unavailable" | "not-found" | "error"
      readonly message: string
    }
