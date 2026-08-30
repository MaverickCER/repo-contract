/**
 * Evidence shape printed to stdout by check.ts (as JSON, for repo-contract.config.ts's
 * `output: { format: "json" }` to parse) and consumed by policy.ts. This is this repo's own
 * internal tooling contract -- never published, never imported by anything outside
 * scripts/api-contract/ and its tests -- so it's kept as a rich, explicit discriminated-union
 * domain model rather than a compressed generic shape: the extra verbosity buys compiler-enforced
 * exhaustiveness as the classifier grows. See
 * specs/decisions/0008-api-contract-compatibility-gate.md for the full reasoning.
 */

/** Aggregate fact about the public contract delta between baseline and current. "unknown" means the delta could not be safely classified -- never silently downgraded to "compatible" or "unchanged". */
export type ContractImpact = "unchanged" | "compatible" | "breaking" | "unknown"

/**
 * The SemVer release level required by a classified contract delta. Deliberately excludes
 * "unknown" -- a release level is a prescriptive SemVer magnitude, and "we couldn't determine it"
 * is not one. An `impact: "unknown"` evidence therefore carries no `requiredLevel` at all rather
 * than a synthetic placeholder value.
 */
export type RequiredReleaseLevel = "none" | "patch" | "minor" | "major"

/**
 * The kind of public-contract change a single `ApiContractChange` represents. One entry per
 * category from the compatibility-analysis requirements, kept as explicit union members (not
 * collapsed into a generic "changed") so classifier/formatter/policy code can exhaustively switch
 * on it as the ruleset grows.
 */
export type ChangeKind =
  | "export-added"
  | "export-removed"
  | "release-tag-changed"
  | "parameter-added"
  | "parameter-removed"
  | "parameter-optionality-changed"
  | "parameter-type-changed"
  | "return-type-changed"
  | "property-added"
  | "property-removed"
  | "property-optionality-changed"
  | "property-readonly-changed"
  | "property-type-changed"
  | "generic-parameter-changed"
  | "overload-added"
  | "overload-removed"
  | "overload-changed"
  | "heritage-changed"
  | "enum-member-added"
  | "enum-member-removed"
  | "enum-member-changed"
  | "type-alias-changed"
  | "constructor-changed"
  | "deprecation-changed"
  | "documentation-only"
  | "indeterminate"
  | "schema-version-literal-stale"

/** One classified public-contract change: a stable identity, what kind of change it was, its compatibility, and why. */
export interface ApiContractChange {
  /** Stable, canonical-reference-derived identity for this change -- deterministic across runs for the same contract delta. */
  readonly id: string
  /** Human-readable scoped path, e.g. "MyClass.myMethod" or "getUsers". */
  readonly path: string
  readonly kind: ChangeKind
  readonly compatibility: "compatible" | "breaking" | "unknown"
  readonly explanation: string
}

/** Identity/provenance information for one side (baseline or current) of the comparison. */
export interface ApiContractSnapshot {
  readonly packageName: string
  readonly apiExtractorVersion: string
  readonly apiJsonSchemaVersion: number
  /** sha256 of the normalized, deterministic model -- the identity of this snapshot's public contract. */
  readonly apiJsonHash: string
  /** Present only for "current" -- a baseline read from git HEAD has no working-tree file path. */
  readonly apiReportPath?: string
}

/**
 * What the branch's Conventional Commits (and, in CI, the PR title) declare about the release
 * bump -- and whether that clears the minimum the public-API diff requires. `satisfied` is
 * `null` when there is nothing to compare against: `impact === "unknown"` (no `requiredLevel`)
 * or the initial-baseline run. See specs/decisions/0008-api-contract-compatibility-gate.md.
 */
export interface CommitAnalysisEvidence {
  /** Number of commit messages considered (branch commits, plus the PR title when supplied). */
  readonly analyzed: number
  /** Whether a CI-supplied PR title was among the messages considered. */
  readonly prTitleConsidered: boolean
  /** The largest bump the considered messages declare. */
  readonly declaredLevel: RequiredReleaseLevel
  /** `declaredLevel >= requiredLevel`; `null` when there is no `requiredLevel` to check against. */
  readonly satisfied: boolean | null
}

/**
 * The complete evidence this check produces. `impact === "unknown"` if and only if `requiredLevel`
 * and `minimumRequiredVersion` are both absent -- the check never invents a release level or
 * version for an indeterminate contract delta. `initialBaseline: true` evidence flows through the
 * same shape as an ordinary unchanged-contract run (`impact: "unchanged"`, `requiredLevel: "none"`,
 * `minimumRequiredVersion: "0.1.0"`, `diff: []`) -- the absence of a historical contract is a known
 * state, not an unknown one.
 */
export interface ApiContractEvidence {
  readonly initialBaseline: boolean
  /** Absent iff `initialBaseline`. */
  readonly baseline?: ApiContractSnapshot
  readonly current: ApiContractSnapshot
  /** Always sorted by `id` for determinism. Empty when `initialBaseline` or when nothing changed. */
  readonly diff: readonly ApiContractChange[]
  /**
   * Changes visible only below this check's own `--release-tag` threshold (currently
   * `@beta`/`@alpha`/`@internal`) -- included for visibility only. Always sorted by `id`; empty
   * when `initialBaseline` or when nothing changed below the threshold. Never affects `impact`,
   * `requiredLevel`, or `minimumRequiredVersion` -- those remain derived exclusively from `diff`
   * (the threshold-admitted contract), which is what actually drives SemVer.
   */
  readonly lowerTierDiff: readonly ApiContractChange[]
  readonly impact: ContractImpact
  /** Absent iff `impact === "unknown"`. */
  readonly requiredLevel?: RequiredReleaseLevel
  /** Absent iff `impact === "unknown"`. `"0.1.0"` when `initialBaseline`. */
  readonly minimumRequiredVersion?: string
  /** Absent iff `initialBaseline` -- provenance metadata about the historical snapshot, not a property of the TypeScript contract itself. */
  readonly baselineVersion?: string
  /** Observational only -- the check's own record of package.json's current version. The policy never trusts this as its authority; see policy.ts. */
  readonly currentVersion: string
  /** Deterministic, generated from `diff`/`impact`/`initialBaseline` -- never hand-authored per scenario. */
  readonly summary: string
  readonly commits: CommitAnalysisEvidence
}
