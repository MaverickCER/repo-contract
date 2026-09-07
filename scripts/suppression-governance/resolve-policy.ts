import { evaluateExceptionRecord, hashRequirementFields } from "../../src/helpers/index.js"
import type { ExceptionClassification } from "../../src/helpers/index.js"
import type { SuppressionGovernanceRecordEvidence } from "./evidence-types.js"
import type { SuppressionPolicyConfig, SuppressionRequirement } from "./policy-config.js"
import { GLOBAL_DEFAULT_POLICY } from "./policy-config.js"
import { stageMissingFields } from "../shared/exception-record.js"

/**
 * Suppression-governance's own thin instantiation of `repo-contract/helpers`'s classification-
 * neutral exception-policy resolver -- see specs/decisions/0013-reusable-exception-policy-helper.md.
 * The generic exact/glob/domain-default/global-default precedence, the `"*"` blanket-suppression
 * special case, and the strictest-policy merge across multiple classifications now all live in
 * `resolveExceptionPolicy`/`stricterOf`/`evaluateExceptionRecord` (`src/helpers/exception-policy.ts`)
 * -- this file only maps a `DisableCommentRecord`'s own shape onto that generic contract:
 * `{ group: record.domain, category: rule }` per entry in `record.rule`, and `fieldValue` indexing
 * one of the five hand-authored fields (`justification`/`alternatives`/`remediation`/`category`/
 * `verificationMethod`) or the mechanically-derived `reason`.
 */

type SuppressionRecordVerdict = "forbidden" | "insufficient" | "permitted"

interface SuppressionRecordDeterminant {
  readonly record: SuppressionGovernanceRecordEvidence
  readonly verdict: SuppressionRecordVerdict
  readonly missing: readonly SuppressionRequirement[]
}

/** The six authoring fields `verifiedContentHash` is bound to -- editing any of these after sign-off invalidates the hash and reverts `verifiedBy` to "missing". Order matters: it is the exact order `hashRequirementFields` digests. */
const HASHED_AUTHORING_FIELDS: readonly SuppressionRequirement[] = [
  "justification",
  "alternatives",
  "remediation",
  "category",
  "verificationMethod",
  "reason",
]

/**
 * Reads one authoring field's raw current string value straight off `record` -- the completeness
 * primitive the generic core wants, and the exact input `hashRequirementFields` digests for the
 * content-bound `"verifiedBy"` check below.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value.
 */
function rawFieldValue(record: SuppressionGovernanceRecordEvidence, requirement: string): string {
  return record[requirement as SuppressionRequirement]
}

/**
 * Resolves one required field's current value on `record`. Every field but `"verifiedBy"` is read
 * straight off the record. `"verifiedBy"` is *content-bound*: it resolves to the signer's name
 * only when `record.verifiedContentHash` still equals `hashRequirementFields()` recomputed from
 * the record's current authoring fields -- so editing a justification (or any of the six
 * `HASHED_AUTHORING_FIELDS`) after sign-off makes `"verifiedBy"` resolve to `""` again, and the
 * record fails policy until it is re-reviewed and re-signed. `requirement` arrives as a plain
 * `string` (the generic core's contract), but every value it is actually called with here is
 * drawn from a policy's `requirements` array, already confirmed a member of
 * `SuppressionRequirement` by `validateExceptionPolicyConfig` (see checks/suppression-governance.ts).
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (or `""` for an unverified/stale `"verifiedBy"`).
 */
function fieldValue(record: SuppressionGovernanceRecordEvidence, requirement: string): string {
  if (requirement === "verifiedBy") {
    if (record.verifiedContentHash.length === 0) return ""
    const currentHash = hashRequirementFields(record, HASHED_AUTHORING_FIELDS, rawFieldValue)
    return record.verifiedContentHash === currentHash ? record.verifiedBy : ""
  }
  return rawFieldValue(record, requirement)
}

/**
 * Evaluates one registry record's every `rule` against `policyConfig`, taking the strictest
 * (`stricterOf`) of the per-rule resolved policies -- a record naming both a forbidden rule and an
 * otherwise-fine rule is forbidden overall. A required field only counts as satisfied once it's a
 * non-empty (post-trim) string -- an empty `justification`/`alternatives`/`remediation` is
 * registry-valid but policy-insufficient, exactly as `"exception"` mode's name implies.
 * @param record - The registry record to evaluate.
 * @param policyConfig - The suppression policy configuration to evaluate against.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 */
export function evaluateRecord(
  record: SuppressionGovernanceRecordEvidence,
  policyConfig: SuppressionPolicyConfig,
): SuppressionRecordDeterminant {
  // `record.rule` is a non-empty array by the registry's own validated invariant
  // (registry.ts's validateRecord, recognizers.ts) -- TypeScript can't express that
  // non-emptiness through a plain `.map()` over a `readonly string[]`, so the result is cast
  // (via `unknown`, since a same-length array type doesn't structurally overlap with a non-empty
  // tuple type on its own) to the non-empty tuple `evaluateExceptionRecord` requires, rather than
  // that requirement being re-proven here.
  const classifications = record.rule.map((rule) => ({
    group: record.domain,
    category: rule,
  })) as unknown as readonly [ExceptionClassification, ...ExceptionClassification[]]

  const determinant = evaluateExceptionRecord({
    record,
    classifications,
    config: policyConfig,
    globalDefault: GLOBAL_DEFAULT_POLICY,
    fieldValue,
  })

  return {
    record: determinant.record,
    verdict: determinant.verdict,
    missing: determinant.missing as readonly SuppressionRequirement[],
  }
}

/**
 * A one-line, actionable identification of a record -- its file, line, domain, rule(s), and content.
 * @param record - The record to describe.
 * @returns A one-line description of `record`.
 */
export function describeRecord(record: SuppressionGovernanceRecordEvidence): string {
  return `${record.file}:${String(record.line)} [${record.domain}: ${record.rule.join(", ")}] "${record.content}"`
}

/**
 * Renders one non-permitted record's determinant as a rationale line.
 * @param determinant - The record's evaluated verdict and (if insufficient) missing fields.
 * @returns A one-line, actionable description of why `determinant.record` failed policy.
 */
export function formatOffender(determinant: SuppressionRecordDeterminant): string {
  const { record, verdict, missing } = determinant

  if (verdict === "forbidden") {
    return `${describeRecord(record)} -- forbidden by policy.`
  }
  // Stage `verifiedBy`: a record whose authoring fields aren't all filled yet is asked only for
  // those; `verifiedBy` is added to the ask on the next run, once there is prose to sign off on.
  const staged = stageMissingFields(missing, "verifiedBy")
  return `${describeRecord(record)} -- insufficient justification (missing: ${staged.join(", ")}).`
}
