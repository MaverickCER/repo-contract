/**
 * Evidence shape printed to stdout by check.ts (as JSON, for repo-contract.config.ts's
 * `output: { format: "json" }` to parse) and consumed by policy.ts. Internal, unpublished tooling
 * contract -- never imported by anything outside scripts/adr-governance/ and its tests. See
 * specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md for the full reasoning.
 */

/**
 * The complete evidence this check produces. `satisfied` is the single fact the policy gates on:
 * true whenever `governedFilesTouched` is empty (nothing governed changed), or `adrFilesTouched` is
 * non-empty (the ADR set itself was engaged), or `referencedAdrNumbers` contains at least one number
 * that resolves to a real, currently-existing file under `specs/decisions/`.
 */
export interface AdrGovernanceEvidence {
  readonly baseRef: string
  /** Files changed relative to `baseRef` under a governed path (`src/execution/**`, `src/policy/**`). */
  readonly governedFilesTouched: readonly string[]
  /** Files changed relative to `baseRef` under `specs/decisions/`, in any way (add/edit/rename). */
  readonly adrFilesTouched: readonly string[]
  /** The changeset file this run located and read, if any. */
  readonly changesetPath: string | undefined
  /**
   * Every syntactically valid `ADR NNNN`-shaped reference found in the changeset file's body,
   * regardless of whether the number resolves to a real file -- kept for rationale/debuggability,
   * not itself the gate.
   */
  readonly referencedAdrNumbers: readonly string[]
  /** Subset of `referencedAdrNumbers` that actually corresponds to a real file under `specs/decisions/`. */
  readonly resolvedAdrNumbers: readonly string[]
  readonly satisfied: boolean
}
