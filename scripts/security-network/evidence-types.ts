/**
 * Shapes shared between scripts/security-network/scan.ts (discovers prohibited network capability
 * in src/**\/*.ts, then reconciles .repo-contract/exceptions/security-network.json against what it
 * found) and its policy layer (checks/security-network.ts). See
 * specs/decisions/0007-no-network-surface.md and
 * specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
 * surface" amendment for the full rationale.
 */

import type { SecurityExceptionFields } from "../shared/exception-record.js"

/** What kind of prohibited (or unverifiable) capability a finding represents. */
export type NetworkCapabilityKind =
  | "restricted-module-import"
  | "restricted-named-import"
  | "restricted-global-usage"
  | "dynamic-import-non-literal-specifier"
  | "non-literal-preset-command"
  | "unreviewed-preset-command"

/**
 * One prohibited (or unverifiable) capability found in a single source file -- a raw *finding*,
 * emitted whether or not an exception record backs it. `id` is this finding's check-namespaced
 * semantic identity (`security-network:<capability>:<file>:<line>:<column>`) and the exact key an
 * exception record must carry to waive it. It is per-syntax-position, so it is injective over a
 * run's findings; it does churn when the offending line moves (see ADR 0013's line-in-id note).
 */
export interface NetworkCapabilityFinding {
  /** `security-network:<capability>:<file>:<line>:<column>` -- see `deriveNetworkExceptionId`. */
  readonly id: string
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

/** One row of security-network.json -- the on-disk exception record shape. */
export interface NetworkExceptionRecord extends SecurityExceptionFields {
  /** `security-network:<capability>:<file>:<line>:<column>` -- must equal `deriveNetworkExceptionId(record)`. */
  readonly id: string
  readonly version: 1
  /** Why this network capability in `src/**` is deliberately permitted for an approved architectural reason, and confirmation the finding is real (not a scan misread). */
  readonly justification: string
  readonly capability: NetworkCapabilityKind
  readonly file: string
  readonly line: number
  readonly column: number
}

/**
 * The scan's full evidence.
 *
 * `filesScanned` / `findings` are every file looked at and every raw finding (nothing filtered).
 * `activeExceptions` is the reconciled live record for each finding, keyed by finding id --
 * `set(findings.map(id))` equals `set(keys(activeExceptions))` exactly. `staleExceptions` is every
 * prior record whose id matched no finding this run (surfaced for the policy to fail on, never
 * removed here). `scaffoldedIds` is the subset of `activeExceptions` keys freshly stubbed this
 * run. `registryError` is set (and reconciliation skipped) when the on-disk registry failed to
 * load or validate, or a `deriveId` collision / write failure occurred -- the policy fails on it.
 */
export interface NetworkScanEvidence {
  readonly registryPath: string
  readonly filesScanned: number
  readonly findings: readonly NetworkCapabilityFinding[]
  readonly activeExceptions: Readonly<Record<string, NetworkExceptionRecord>>
  readonly staleExceptions: readonly NetworkExceptionRecord[]
  readonly scaffoldedIds: readonly string[]
  readonly registryError?: readonly string[]
}
