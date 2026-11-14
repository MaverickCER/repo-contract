import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../src/helpers/index.js"

/**
 * The `coderabbitai` check's own instantiation of `repo-contract/helpers`'s classification-neutral
 * exception policy (see specs/decisions/0013-reusable-exception-policy-helper.md): a single
 * `"coderabbit"` group. A CodeRabbit finding is an AI opinion, not a deterministic tool result.
 * Every one requires a complete finding-specific exception regardless of severity. One
 * group-level `default` therefore expresses "every severity, same requirements". Required fields:
 * `justification`, `remediation`, `method`, `exceptionType` (all root fields on the reconciled
 * record). `method` may only be `"independent-human-review"` for a CodeRabbit waiver, because
 * there is no tool to mechanically re-run. `scripts/coderabbitai/registry.ts` enforces this. It
 * rejects `method: "mechanical-reverification"` and excludes `"validated-false-positive"` from its
 * allowed `exceptionType` set.
 */
const ALL_REQUIREMENTS = ["justification", "remediation", "method", "exceptionType"] as const

export const coderabbitPolicy: ExceptionPolicyConfig = {
  coderabbit: {
    default: { mode: "exception", requirements: [...ALL_REQUIREMENTS] },
  },
}

/** Used only if a future refactor ever resolves a classification whose `group` isn't `"coderabbit"`: never actually reached today. Kept maximally strict. */
export const CODERABBIT_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...ALL_REQUIREMENTS],
}

/** Every field name this check's own `"exception"` mode policy may require: passed to `validateExceptionPolicyConfig` as `validRequirements`. */
export const VALID_CODERABBIT_REQUIREMENTS = ALL_REQUIREMENTS
