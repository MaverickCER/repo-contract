import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `security-socket` check's own instantiation of `repo-contract/helpers`'s classification-neutral
 * exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md) -- a single
 * `"socket"` group, classified purely on `NormalizedSocketAlert.severity` (`scripts/security-socket/
 * evidence-types.ts`). Per the user's own direction: any alert above a medium rating is `forbidden`
 * outright; every other alert is permitted only with a finding-specific, *verified* exception --
 * `"verification.verifiedBy"` is a genuinely required field in every `"exception"` policy below (not
 * a lesser, optional add-on -- `evaluateExceptionRecord`'s own pass/fail semantics apply to it
 * exactly like any other named requirement). What changes is only *when a record's rationale
 * mentions it*: `checks/shared/evaluate-exception-findings.ts`'s `stageMissingFields` filters
 * `"verification.verifiedBy"` out of a record's reported `missing` list until every authoring field
 * (`justification`/`alternatives`/`remediation`/`exceptionType`) is already filled in -- a
 * presentation choice applied in `checks/security-socket.ts`, not a change to what's actually
 * enforced here.
 */
const VERIFICATION_FIELD = "verification.verifiedBy"
const AUTHORING_REQUIREMENTS_FULL = [
  "justification",
  "alternatives",
  "remediation",
  "exceptionType",
]
const AUTHORING_REQUIREMENTS_LIGHT = ["justification", "exceptionType"]

export const socketPolicy: ExceptionPolicyConfig = {
  socket: {
    rules: {
      critical: { mode: "forbidden" },
      high: { mode: "forbidden" },
      middle: {
        mode: "exception",
        requirements: [...AUTHORING_REQUIREMENTS_FULL, VERIFICATION_FIELD],
      },
      low: {
        mode: "exception",
        requirements: [...AUTHORING_REQUIREMENTS_LIGHT, VERIFICATION_FIELD],
      },
      // A severity value the scan wrapper didn't recognize is treated at least as strictly as
      // "middle" -- an unrecognized severity is never assumed safe.
      unknown: {
        mode: "exception",
        requirements: [...AUTHORING_REQUIREMENTS_FULL, VERIFICATION_FIELD],
      },
    },
  },
}

/** Used only if a future refactor ever resolves a classification whose `group` isn't `"socket"` at all -- never actually reached today, since this check only ever classifies against that one group. Kept maximally strict rather than omitted, matching `suppression-governance`'s own `GLOBAL_DEFAULT_POLICY` convention. */
export const SOCKET_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...AUTHORING_REQUIREMENTS_FULL, VERIFICATION_FIELD],
}

/** Every field name this check's own `"exception"` mode policies may require -- passed to `validateExceptionPolicyConfig` as `validRequirements`. */
export const VALID_SOCKET_REQUIREMENTS = [
  "justification",
  "alternatives",
  "remediation",
  "exceptionType",
  VERIFICATION_FIELD,
] as const
