/**
 * Shapes for the `security-socket` self-hosting check -- `scripts/security-socket/scan.ts`
 * normalizes `@socketsecurity/cli`'s own real output into this repo-contract-owned model, and
 * `checks/security-socket.ts`'s policy reads (never re-derives) it. See
 * specs/decisions/0013-reusable-exception-policy-helper.md and this check's own doc comment for
 * why normalization -- not the raw tool JSON -- is the evidence contract.
 *
 * The `passed`/`unavailable`/`error` states below were confirmed directly against a real,
 * installed `@socketsecurity/cli` (unauthenticated, since this environment holds no Socket org
 * token) -- see `scan.ts`'s own comments for the exact observed JSON shapes. The `failed` state's
 * `alerts` shape (a real, authenticated org scan with policy violations) could **not** be
 * confirmed the same way in this environment; it is built defensively from Socket's publicly
 * documented alert-action vocabulary (Block/Warn/Monitor/Ignore) and severity tiers
 * (critical/high/middle/low -- Socket's own dashboard terminology, "middle" rather than
 * "medium"), and the wrapper fails closed (`status: "error"`) on anything that doesn't match this
 * shape rather than guessing. Confirming this against a real authenticated org scan is an open
 * item -- see the PR description.
 */

/** One Socket.dev alert, normalized from the CLI's own report shape. */
export interface NormalizedSocketAlert {
  /** This alert's canonical registry-matching identity: `` `${package}@${version}:${type}` ``. */
  readonly id: string
  readonly package: string
  readonly version: string
  /** Socket's own alert type, verbatim (e.g. `"envVars"`, `"shellAccess"`). */
  readonly type: string
  /** A recognized report shape whose severity value isn't one of the four known tiers -> `"unknown"` (still evaluated). A structurally malformed report is `status: "error"` instead -- these two are never conflated. */
  readonly severity: "critical" | "high" | "middle" | "low" | "unknown"
  /** Socket's own policy action for this alert (`"block"`/`"warn"`/`"monitor"`/`"ignore"`), if the report carries one -- evidence only, never itself a classification axis. */
  readonly action?: string
}

export type SecuritySocketEvidence =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly alerts: readonly NormalizedSocketAlert[] }
  | {
      readonly status: "unavailable"
      readonly reason: "cli-not-installed" | "not-authenticated" | "network-unreachable"
    }
  // Structurally malformed/unrecognized report, or a spawn/runtime failure that isn't one of the
  // two more specific `unavailable` reasons above -- fails closed, exactly like
  // `checks/mutation.ts` does for a malformed Stryker report.
  | { readonly status: "error"; readonly message: string }
