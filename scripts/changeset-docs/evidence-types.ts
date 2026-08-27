/**
 * Evidence shape printed to stdout by check.ts (as JSON, for repo-contract.config.ts's
 * `output: { format: "json" }` to parse) and consumed by policy.ts. Internal, unpublished tooling
 * contract -- never imported by anything outside scripts/changeset-docs/ and its tests. See
 * specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md for the full reasoning.
 */

/**
 * One file changed in this PR (relative to its base branch) and its documentation status.
 * `description` is `undefined` while the row still carries the placeholder text -- a row is never
 * considered described until a human or AI has replaced that placeholder with real content.
 */
export interface DocTableRow {
  readonly path: string
  readonly changeKind: "added" | "modified" | "deleted" | "renamed"
  /** Present only when `changeKind === "renamed"`. */
  readonly renamedFrom?: string
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly description: string | undefined
}

/**
 * The complete evidence this check produces. `allDescribed` is the single fact the policy gates on;
 * `rows` is always sorted by `path` for determinism. `changesetPath` is `undefined` only when there
 * is nothing to document (`rows.length === 0`) and no changeset file was touched.
 */
export interface ChangesetDocsEvidence {
  readonly baseRef: string
  readonly rows: readonly DocTableRow[]
  readonly changesetPath: string | undefined
  readonly allDescribed: boolean
}
