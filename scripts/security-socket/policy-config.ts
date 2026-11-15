import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `security-socket` check's instantiation of `repo-contract/helpers`'s classification-
 * neutral exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md): a
 * single `"socket"` group, classified purely on `NormalizedSocketAlert.severity`. By the
 * owner's decision, any alert above a medium ("middle") rating is `forbidden` outright. Every
 * other alert needs a finding-specific exception whose every named field is non-empty.
 * Every requirement is a root field on the reconciled record (`justification`,
 * `alternatives`, `remediation`, `method`, `exceptionType`); `"low"` alerts drop the
 * `alternatives`/`remediation` prose.
 */
const AUTHORING_REQUIREMENTS_FULL = [
  "justification",
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
]
const AUTHORING_REQUIREMENTS_LIGHT = ["justification", "method", "exceptionType"]

export const socketPolicy: ExceptionPolicyConfig = {
  socket: {
    rules: {
      critical: { mode: "forbidden" },
      high: { mode: "forbidden" },
      middle: { mode: "exception", requirements: [...AUTHORING_REQUIREMENTS_FULL] },
      low: { mode: "exception", requirements: [...AUTHORING_REQUIREMENTS_LIGHT] },
      // A severity value the scan wrapper didn't recognize is treated at least as strictly as
      // "middle": an unrecognized severity is never assumed safe.
      unknown: { mode: "exception", requirements: [...AUTHORING_REQUIREMENTS_FULL] },
    },
  },
  // A second, independent classification axis. checks/security-socket.ts's evaluateAlert
  // always passes the alert's severity. It passes the alert's category as a separate
  // classification ONLY when alert.shipped is true. evaluateExceptionRecord takes the strictest
  // verdict across all of them. By the owner's decision, no supply-chain-risk finding on a
  // SHIPPED dependency is ever waivable, at any severity. Consider a "low"-severity
  // supplyChainRisk alert on a shipped package (e.g. envVars/gptAnomaly access, both seen in
  // Socket.dev package scores). This rule exists to reject that class outright,
  // never merely to require a fuller justification for it. A `peerDependencies` package
  // counts as shipped here too. Declaring a peer range is itself a supply-chain choice this
  // package makes for the consumer. Only a strictly `devDependencies`-only package's
  // supplyChainRisk alert never reaches this rule (the classification is omitted, not merely
  // satisfied). Such an alert is governed purely by the severity classification above, the same
  // as every other alert category (quality, vulnerability, license, maintenance, ...).
  "socket-category": {
    rules: {
      supplyChainRisk: { mode: "forbidden" },
    },
    default: { mode: "allowed" },
  },
}

/** Used only if a future refactor ever resolves a classification whose `group` isn't `"socket"`: never reached today. Kept maximally strict. */
export const SOCKET_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...AUTHORING_REQUIREMENTS_FULL],
}

/** Every field name this check's `"exception"` mode policies may require: passed to `validateExceptionPolicyConfig` as `validRequirements`. */
export const VALID_SOCKET_REQUIREMENTS = [
  "justification",
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
] as const
