import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `security-network` check's own instantiation of `repo-contract/helpers`'s classification-
 * neutral exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md), a
 * single `"security-network"` group classified on the finding's own `capability` kind.
 *
 * ADR 0007's default posture is unchanged and absolute: `src/**` must never perform network I/O,
 * and the `default` below is `forbidden` -- a capability kind this policy does not name has no
 * waiver path at all. The six recognized `NetworkCapabilityKind`s resolve to `exception`, permitted
 * only once every field in `VALID_SECURITY_NETWORK_REQUIREMENTS` is non-empty on the reconciled
 * record: `justification`, `alternatives`, `remediation`, `method` (an `EXCEPTION_METHODS`
 * member -- how the waiver's claim was substantiated), and `exceptionType`. The waiver never
 * changes the default posture; it is an additive, reviewed, per-finding exception to it.
 */
export const VALID_SECURITY_NETWORK_REQUIREMENTS = [
  "justification",
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
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
    },
  },
}

/**
 * The global default, used only for a classification whose `group` isn't `"security-network"` --
 * never reached today, kept `forbidden` so a future miswiring fails closed rather than silently
 * permitting.
 */
export const SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = { mode: "forbidden" }
