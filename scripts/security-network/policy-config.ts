import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `security-network` check's own instantiation of `repo-contract/helpers`'s classification-
 * neutral exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md), a
 * single `"security-network"` group classified on the finding's own `capability` kind.
 *
 * ADR 0007's default posture is unchanged and absolute (see its own "default policy vs. reviewed
 * waiver mechanism" amendment): `src/**` must never perform network I/O, and the `default` below
 * is `forbidden` -- a capability kind this policy does not name has no waiver path at all. The
 * six recognized `NetworkCapabilityKind`s resolve to `exception`, which is strictly *narrower*
 * than the mechanism it replaces: the old path was a prose-only `disable-comments.json` entry, and
 * this one additionally requires a small closed `exceptionType`, a content-bound
 * `verification.verifiedBy` (staged -- see `checks/shared/evaluate-exception-findings.ts`), and,
 * because there is no more-authoritative scanner to mechanically re-run against a
 * genuinely-reachable capability, an `independent-human-review` verification method
 * (`scripts/security-network/registry.ts`). The waiver never changes the default posture; it is
 * an additive, reviewed, per-finding exception to it.
 */
/** The verification sign-off field, staged in the reported `missing` list -- see `checks/shared/evaluate-exception-findings.ts`. Exported so `checks/security-network.ts` and its tests partition `VALID_SECURITY_NETWORK_REQUIREMENTS` on the same literal rather than each re-declaring it. */
export const VERIFICATION_FIELD = "verification.verifiedBy"

/** Every field name this check's own `"exception"` mode policy requires -- passed to `validateExceptionPolicyConfig` as `validRequirements`, and the single list `WAIVABLE` below and every derived `PROSE_REQUIREMENTS` elsewhere is built from. Order matters: `hashRequirementFields` digests the prose fields in exactly this order. */
export const VALID_SECURITY_NETWORK_REQUIREMENTS = [
  "justification",
  "alternatives",
  "remediation",
  "exceptionType",
  VERIFICATION_FIELD,
] as const

const WAIVABLE: ExceptionPolicy = {
  mode: "exception",
  requirements: [...VALID_SECURITY_NETWORK_REQUIREMENTS],
}

/**
 * Every recognized capability kind resolves to `exception`; anything else hits `default`
 * (`forbidden`). Listed explicitly so a `validateExceptionPolicyConfig` misconfiguration is
 * caught and the set stays auditable against `scripts/security-network/evidence-types.ts`'s
 * `NetworkCapabilityKind`.
 */
export const securityNetworkPolicy: ExceptionPolicyConfig = {
  "security-network": {
    default: { mode: "forbidden" },
    rules: {
      "restricted-module-import": WAIVABLE,
      "restricted-named-import": WAIVABLE,
      "restricted-global-usage": WAIVABLE,
      "dynamic-import-non-literal-specifier": WAIVABLE,
      "non-literal-preset-command": WAIVABLE,
      "unreviewed-preset-command": WAIVABLE,
    },
  },
}

/**
 * The global default, used only for a classification whose `group` isn't `"security-network"` --
 * never reached today (the check only ever classifies on that one group), kept `forbidden` so a
 * future miswiring fails closed rather than silently permitting.
 */
export const SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = { mode: "forbidden" }
