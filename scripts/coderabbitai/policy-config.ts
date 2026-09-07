import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `coderabbitai` check's own instantiation of `repo-contract/helpers`'s classification-neutral
 * exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md) -- a single
 * `"coderabbit"` group, classified purely on `NormalizedFinding.severity`. Unlike `security-socket`
 * (which forbids anything above medium outright), every CodeRabbit finding -- an AI opinion, not a
 * deterministic tool result -- requires a finding-specific, *verified* exception regardless of
 * severity; `"verification.verifiedBy"` is a genuinely required field in every policy below (see
 * this file's own module doc comment on `checks/security-socket.ts`'s identical staging note,
 * which applies here unchanged).
 */
const VERIFICATION_FIELD = "verification.verifiedBy"
const AUTHORING_REQUIREMENTS = ["justification", "remediation", "exceptionType"]

export const coderabbitPolicy: ExceptionPolicyConfig = {
  coderabbit: {
    rules: {
      critical: {
        mode: "exception",
        requirements: [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD],
      },
      major: { mode: "exception", requirements: [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD] },
      minor: { mode: "exception", requirements: [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD] },
      unknown: {
        mode: "exception",
        requirements: [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD],
      },
    },
  },
}

/** Used only if a future refactor ever resolves a classification whose `group` isn't `"coderabbit"` at all -- never actually reached today. Kept maximally strict rather than omitted, matching `suppression-governance`'s own `GLOBAL_DEFAULT_POLICY` convention. */
export const CODERABBIT_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD],
}

/** Every field name this check's own `"exception"` mode policies may require -- passed to `validateExceptionPolicyConfig` as `validRequirements`. */
export const VALID_CODERABBIT_REQUIREMENTS = [
  "justification",
  "remediation",
  "exceptionType",
  VERIFICATION_FIELD,
] as const
