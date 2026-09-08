/**
 * Shapes for the self-hosted `dead-code` check -- `scripts/dead-code/check.ts` runs knip with
 * **no** exemptions (every unused-dependency/export/etc. issue is a raw finding, nothing filtered
 * before evidence is built), reconciles `.repo-contract/exceptions/dead-code.json` against that
 * full set, and `checks/dead-code.ts`'s policy reads (never re-derives) the result. See
 * specs/decisions/0008-self-hosting-tool-and-dependency-choices.md's amendment and
 * specs/decisions/0013-reusable-exception-policy-helper.md's "review surface" amendment.
 *
 * This is deliberately a *different* code path from the published `deadCode` preset
 * (`src/presets/dead-code.ts`), which this repository no longer uses for its own run (only for
 * dogfooding/exercising the public API elsewhere). A published preset's own config-time
 * `exemptUnusedDevDependencies` option would have to already know its exempt list before running
 * knip -- exactly the boot-time chicken-and-egg loop a *reconciled* registry cannot express (the
 * registry that would suppress a finding can only be built from findings that already ran
 * unsuppressed). Self-hosting knip directly avoids that loop entirely: knip always runs raw, every
 * finding is real, and the registry decides what is waived only *after* the run.
 */

/** One knip issue category, normalized to a stable kebab-case kind name. */
export type DeadCodeKind =
  | "unused-dependency"
  | "unused-dev-dependency"
  | "unused-optional-peer-dependency"
  | "unlisted-dependency"
  | "unresolved-import"
  | "unused-export"
  | "unused-export-namespace"
  | "unused-type"
  | "unused-type-namespace"
  | "unused-namespace-member"
  | "unused-enum-member"
  | "unlisted-binary"
  | "duplicate-export"
  | "circular-dependency"
  | "unused-file"

/**
 * One knip finding -- a raw issue, emitted whether or not an exception record backs it. `id` is
 * this finding's check-namespaced semantic identity: `dead-code:<kind>:<name>`. The package/export
 * name is the subject, not its file/line -- perfectly stable across an unrelated refactor,
 * because the same symbol or dependency name reported unused in two different files is a genuinely
 * rare collision `reconcileExceptions` surfaces as an integrity failure rather than silently
 * merging (make the two distinguishable, e.g. by renaming one).
 */
export interface DeadCodeFinding {
  /** `dead-code:<kind>:<name>` -- see `deriveDeadCodeId`. */
  readonly id: string
  readonly kind: DeadCodeKind
  /** The dependency or export name knip reported. For a `duplicate-export`/`circular-dependency` group, the joined member names. */
  readonly name: string
  /** The file knip attributed the issue to. */
  readonly file: string
  /** `:line:col`, or `""` when knip reported no location (e.g. a dependency issue, or a group). */
  readonly location: string
}

/** One row of dead-code.json. `justification` is the whole review: why this dependency/export is genuinely needed despite knip's static analysis not seeing a use. */
export interface DeadCodeExceptionRecord {
  /** `dead-code:<kind>:<name>` -- must equal `deriveDeadCodeId(record)`. */
  readonly id: string
  readonly version: 1
  readonly justification: string
  readonly kind: DeadCodeKind
  readonly name: string
}

export type DeadCodeEvidence =
  | {
      readonly ok: true
      readonly registryPath: string
      readonly findings: readonly DeadCodeFinding[]
      readonly activeExceptions: Readonly<Record<string, DeadCodeExceptionRecord>>
      readonly staleExceptions: readonly DeadCodeExceptionRecord[]
      readonly scaffoldedIds: readonly string[]
      readonly registryError?: readonly string[]
    }
  | {
      readonly ok: false
      readonly error: string
      readonly registryError?: readonly string[]
    }

/**
 * The check-namespaced semantic identity of one knip finding: `dead-code:<kind>:<name>`.
 * @param finding - The finding's (or record's) identity fields.
 * @param finding.kind - The normalized knip issue category.
 * @param finding.name - The dependency or export name.
 * @returns The semantic id.
 */
export function deriveDeadCodeId(finding: {
  readonly kind: DeadCodeKind
  readonly name: string
}): string {
  return `dead-code:${finding.kind}:${finding.name}`
}
