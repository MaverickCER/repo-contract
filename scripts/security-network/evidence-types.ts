/**
 * Shapes shared between scripts/security-network/scan.ts (discovers
 * prohibited network capability in src/**\/*.ts) and its policy layer
 * (checks/security-network.ts). See specs/decisions/0013-no-network-surface.md
 * for the full rationale.
 */

/** What kind of prohibited (or unverifiable) capability a finding represents. */
export type NetworkCapabilityKind =
  | "restricted-module-import"
  | "restricted-named-import"
  | "restricted-global-usage"
  | "dynamic-import-non-literal-specifier"
  | "require-call"
  | "non-literal-preset-command"
  | "unreviewed-preset-command"

/** One prohibited (or unverifiable) capability found in a single source file. */
export interface NetworkCapabilityFinding {
  /** Path to the offending file, relative to the repository root. */
  readonly file: string
  /** 1-based line number of the offending syntax. */
  readonly line: number
  /** 1-based column number of the offending syntax. */
  readonly column: number
  readonly capability: NetworkCapabilityKind
  /** Human-readable explanation of what was found and why it's prohibited. */
  readonly detail: string
}

/** The scan's full evidence: every file it looked at, and every finding across all of them. */
export interface NetworkScanEvidence {
  readonly filesScanned: number
  readonly findings: readonly NetworkCapabilityFinding[]
}
