/**
 * Shapes for the `security-socket` self-hosting check -- `scripts/security-socket/scan.ts`
 * normalizes `@socketsecurity/cli`'s own real output into this repo-contract-owned model,
 * reconciles `.repo-contract/exceptions/socket.json` against the alerts it found (when the CLI
 * actually produced an alert assessment), and `checks/security-socket.ts`'s policy reads (never
 * re-derives) the result. See specs/decisions/0013-reusable-exception-policy-helper.md's "The
 * exception registry is the review surface" amendment.
 *
 * The `passed`/`unavailable`/`error` states were confirmed directly against a real, installed
 * `@socketsecurity/cli` (unauthenticated). The `failed` state's `alerts` shape (a real
 * authenticated org scan with policy violations) is built defensively from Socket's documented
 * alert-action vocabulary and severity tiers; the wrapper fails closed (`status: "error"`) on
 * anything that doesn't match.
 */

import type { SecurityExceptionFields } from "../shared/exception-record.js"

/** One Socket.dev alert, normalized from the CLI's own report shape. */
export interface NormalizedSocketAlert {
  /** This alert's check-namespaced semantic identity: `socket:<package>@<version>:<type>`. Injective over a run -- Socket does not emit the same package@version:type twice. */
  readonly id: string
  readonly package: string
  readonly version: string
  /** Socket's own alert type, verbatim (e.g. `"envVars"`, `"shellAccess"`). */
  readonly type: string
  /** A recognized report shape whose severity value isn't one of the four known tiers -> `"unknown"` (still evaluated). A structurally malformed report is `status: "error"` instead. */
  readonly severity: "critical" | "high" | "middle" | "low" | "unknown"
  /**
   * Socket's own alert category, verbatim (e.g. `"supplyChainRisk"`, `"quality"`, `"vulnerability"`)
   * -- confirmed against `@socketsecurity/cli`'s own `SocketSdk.#normalizeArtifact` (`vendor.js`),
   * which always includes `category` alongside `severity`/`type` on a real alert; `normalizeAlert`
   * (`scan.ts`) rejects an entry missing it the same way it rejects one missing `package`/
   * `version`/`type`, consistent with that confirmed guarantee. A `supplyChainRisk` alert is
   * unwaivable regardless of severity -- see `policy-config.ts`'s own doc comment -- but only when
   * `shipped` is also `true`.
   */
  readonly category: string
  /** Socket's own policy action for this alert (`"block"`/`"warn"`/`"monitor"`/`"ignore"`), if the report carries one -- evidence only. */
  readonly action?: string
  /**
   * `true` when `package@version` is reachable via at least one real production edge in
   * package-lock.json (this package's own `dependencies`, transitively) -- i.e. actually installed
   * for a consumer of this package. `false` when it's reachable only through `devDependencies`
   * (this repo's own build/test tooling, never shipped) or `peerDependencies` (supplied by the
   * CONSUMER's own project, never bundled by this one) -- computed by `scan.ts`'s
   * `loadShippedPackageVersions`. This is the scope of the user's own zero-tolerance rule: "only
   * dependencies we ship/install, not peers" -- a `supplyChainRisk` alert on an unshipped
   * peer-only package (e.g. `eslint`/`typescript` in a package that only lists them as peers) is
   * real evidence, kept here, but never forbidden by `checks/security-socket.ts`'s
   * `"socket-category"` policy the way a shipped one is.
   */
  readonly shipped: boolean
}

/** One row of socket.json -- the on-disk exception record shape. */
export interface SocketExceptionRecord extends SecurityExceptionFields {
  /** `socket:<package>@<version>:<type>` -- must equal `deriveSocketExceptionId(record)`. */
  readonly id: string
  readonly version: 1
  /** Why this Socket alert on this dependency is deliberately tolerated, and confirmation it is real. */
  readonly justification: string
  readonly package: string
  readonly packageVersion: string
  readonly type: string
  readonly severity: NormalizedSocketAlert["severity"]
}

export type SecuritySocketEvidence =
  | {
      readonly status: "passed" | "failed"
      readonly registryPath: string
      readonly alerts: readonly NormalizedSocketAlert[]
      readonly activeExceptions: Readonly<Record<string, SocketExceptionRecord>>
      readonly staleExceptions: readonly SocketExceptionRecord[]
      readonly scaffoldedIds: readonly string[]
      readonly registryError?: readonly string[]
    }
  | {
      readonly status: "unavailable"
      readonly reason: "cli-not-installed" | "not-authenticated" | "network-unreachable"
      readonly registryPath: string
      /** How many records the registry currently holds -- not reconciled (the CLI produced no alert list), only validated. */
      readonly existingRecordCount: number
      readonly registryError?: readonly string[]
    }
  | {
      readonly status: "error"
      readonly message: string
      readonly registryPath: string
      readonly existingRecordCount: number
      readonly registryError?: readonly string[]
    }
