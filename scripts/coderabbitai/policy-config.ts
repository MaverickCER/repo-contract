import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `coderabbitai` check's own instantiation of `repo-contract/helpers`'s classification-neutral
 * exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md) -- a single
 * `"coderabbit"` group, classified purely on `NormalizedFinding.severity`. Unlike `security-socket`
 * (which forbids anything above medium outright), every CodeRabbit finding -- an AI opinion, not a
 * deterministic tool result -- requires a finding-specific, *verified* exception regardless of
 * severity, so this group needs no per-severity `rules` table at all: one group-level `default`
 * expresses "every severity, same requirements" without inviting an edit to one severity that
 * silently diverges from the rest. `"verification.verifiedBy"` is a genuinely required field (see
 * ADR 0014 and `checks/security-socket.ts`'s identical staging note).
 */
export const VERIFICATION_FIELD = "verification.verifiedBy"
const AUTHORING_REQUIREMENTS = ["justification", "remediation", "exceptionType"] as const

/** The single required-field list every CodeRabbit exception is held to -- the one source of truth `coderabbitPolicy`, the global default, and `VALID_CODERABBIT_REQUIREMENTS` all derive from. */
const ALL_REQUIREMENTS = [...AUTHORING_REQUIREMENTS, VERIFICATION_FIELD] as const

export const coderabbitPolicy: ExceptionPolicyConfig = {
  coderabbit: {
    default: { mode: "exception", requirements: [...ALL_REQUIREMENTS] },
  },
}

/** Used only if a future refactor ever resolves a classification whose `group` isn't `"coderabbit"` at all -- never actually reached today. Kept maximally strict rather than omitted, matching `suppression-governance`'s own `GLOBAL_DEFAULT_POLICY` convention. */
export const CODERABBIT_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...ALL_REQUIREMENTS],
}

/** Every field name this check's own `"exception"` mode policy may require -- passed to `validateExceptionPolicyConfig` as `validRequirements`. Derived from the same constant `coderabbitPolicy` uses, so the two can never desynchronize. */
export const VALID_CODERABBIT_REQUIREMENTS = ALL_REQUIREMENTS
