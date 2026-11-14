/**
 * Shapes for the `security-socket` self-hosting check. `scripts/security-socket/scan.ts`
 * normalizes `@socketsecurity/cli`'s own real output into this repo-contract-owned model. When
 * the CLI produced an alert assessment, the script also reconciles
 * `.repo-contract/exceptions/socket.json` against the alerts it found. `checks/security-socket.ts`'s
 * policy reads the result and never re-derives it. See specs/decisions/0013-reusable-exception-policy-helper.md's "The
 * exception registry is the review surface" amendment.
 *
 * The `passed`/`unavailable`/`error` states were confirmed directly against a real, installed
 * `@socketsecurity/cli` (unauthenticated). The `failed` state comes from a real authenticated org
 * scan with policy violations. Its `alerts` shape is built defensively from Socket's documented
 * alert-action vocabulary and severity tiers. The wrapper fails closed (`status: "error"`) on
 * anything that doesn't match.
 */

import type { SecurityExceptionFields } from "../shared/exception-record.js"

/** One Socket.dev alert, normalized from the CLI's own report shape. */
export interface NormalizedSocketAlert {
  /** This alert's check-namespaced semantic identity: `socket:<package>@<version>:<type>`. Injective over a run: Socket does not emit the same package@version:type twice. */
  readonly id: string
  readonly package: string
  readonly version: string
  /** Socket's own alert type, verbatim (e.g. `"envVars"`, `"shellAccess"`). */
  readonly type: string
  /** A recognized report shape whose severity value isn't one of the four known tiers -> `"unknown"` (still evaluated). A structurally malformed report is `status: "error"` instead. */
  readonly severity: "critical" | "high" | "middle" | "low" | "unknown"
  /**
   * Socket's own alert category, verbatim (e.g. `"supplyChainRisk"`, `"quality"`, `"vulnerability"`).
   * Confirmed against `@socketsecurity/cli`'s own `SocketSdk.#normalizeArtifact` (`vendor.js`),
   * which always includes `category` alongside `severity`/`type` on a real alert. Consistent with
   * that guarantee, `normalizeAlert` (`scan.ts`) rejects an entry missing it. It treats that the
   * same way as an entry missing `package`/`version`/`type`. A `supplyChainRisk` alert is
   * unwaivable regardless of severity (see `policy-config.ts`'s own doc comment) but only when
   * `shipped` is also `true`.
   */
  readonly category: string
  /** Socket's own policy action for this alert (`"block"`/`"warn"`/`"monitor"`/`"ignore"`), if the report carries one: evidence only. */
  readonly action?: string
  /**
   * `true` when `package@version` is reachable via anything OTHER than a strictly
   * `devDependencies`-only edge in package-lock.json. That means a real `dependencies` edge
   * (installed for a consumer) OR a `peerDependencies` edge. `false` only when it's reachable
   * strictly through `devDependencies` (this repo's own build/test tooling, which never reaches a
   * consumer at all). Computed by `scan.ts`'s `loadShippedPackageVersions`. Per the user's own
   * direction, a peerDependency counts as shipped even though npm doesn't literally bundle it.
   * Declaring a peer range is itself a supply-chain decision this package makes for the consumer.
   * It dictates which version(s) they may use and removes their own choice of alternative. A
   * devDependency is the opposite: it never surfaces to a consumer at all. A `supplyChainRisk`
   * alert on a real peerDependency (e.g. `eslint`/`typescript`) is therefore `forbidden` by
   * `policy-config.ts`'s `"socket-category"` group, exactly like one on an installed `dependencies` entry. Only a
   * strictly-dev-only package's alert escapes this rule.
   */
  readonly shipped: boolean
}

/** One row of socket.json: the on-disk exception record shape. */
export interface SocketExceptionRecord extends SecurityExceptionFields {
  /** `socket:<package>@<version>:<type>`: must equal `deriveSocketExceptionId(record)`. */
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
      /** How many records the registry currently holds: not reconciled (the CLI produced no alert list), only validated. */
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
