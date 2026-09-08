import { evaluateExceptionRecord } from "../../src/helpers/index.js"
import type { ExceptionClassification } from "../../src/helpers/index.js"
import type { SuppressionExceptionRecord, SuppressionFinding } from "./evidence-types.js"
import type { SuppressionPolicyConfig, SuppressionRequirement } from "./policy-config.js"
import { GLOBAL_DEFAULT_POLICY } from "./policy-config.js"

/**
 * Suppression-governance's own thin instantiation of `repo-contract/helpers`'s classification-
 * neutral exception-policy resolver -- see specs/decisions/0013-reusable-exception-policy-helper.md.
 * The generic exact/glob/domain-default/global-default precedence, the `"*"` blanket special case,
 * and the strictest-policy merge across multiple classifications all live in
 * `resolveExceptionPolicy`/`stricterOf`/`evaluateExceptionRecord` (`src/helpers/exception-policy.ts`)
 * -- this file only maps one *finding* and its reconciled record onto that generic contract:
 * `{ group: finding.domain, category: rule }` per entry in `finding.rule`, and `fieldValue`
 * reading one required field from the record (`justification`/`category`/`verificationMethod`) or,
 * for the `stryker`-only `"reason"` requirement, from the finding's mechanically-derived reason
 * text.
 */

export type SuppressionFindingVerdict = "forbidden" | "insufficient" | "permitted" | "unmatched"

export interface SuppressionFindingDeterminant {
  readonly finding: SuppressionFinding
  readonly verdict: SuppressionFindingVerdict
  readonly missing: readonly SuppressionRequirement[]
}

/**
 * The subject `evaluateExceptionRecord`'s `fieldValue` reads from: the reconciled record's own
 * fields, plus the finding's mechanically-derived `reason` (never stored on a record -- it is
 * recomputed from source every run, so a policy that required it off the record would be trusting
 * stale text).
 */
type EvaluationSubject = SuppressionExceptionRecord & { readonly reason: string }

/**
 * Reads one required field's current string value off the combined record+reason subject.
 * @param subject - The record augmented with the finding's `reason`.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
function fieldValue(subject: EvaluationSubject, requirement: string): string {
  const value = (subject as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Evaluates one finding against `policyConfig`, taking the strictest (`stricterOf`) of the
 * per-rule resolved policies -- a finding naming both a forbidden rule and an otherwise-fine rule
 * is forbidden overall. A required field only counts as satisfied once it is a non-empty
 * (post-trim) string.
 * @param finding - The raw suppression finding.
 * @param record - The reconciled live record for this finding (from `evidence.activeExceptions[finding.id]`), or `undefined` if the bijection is somehow broken.
 * @param policyConfig - The suppression policy configuration.
 * @returns The finding's verdict, and which required record fields (if any) are still missing.
 */
export function evaluateFinding(
  finding: SuppressionFinding,
  record: SuppressionExceptionRecord | undefined,
  policyConfig: SuppressionPolicyConfig,
): SuppressionFindingDeterminant {
  if (record === undefined) {
    return { finding, verdict: "unmatched", missing: [] }
  }

  // `finding.rule` is a non-empty array by the registry validator's own invariant and by every
  // recognizer (recognizers.ts) -- but `evaluateExceptionRecord` reduces `classifications` with no
  // seed, so an empty array would throw rather than return a verdict. Guard it: an empty rule list
  // is a malformed finding, treated the same as a missing record (an integrity failure the policy
  // fails on), never a runtime exception out of a pure function.
  if (finding.rule.length === 0) {
    return { finding, verdict: "unmatched", missing: [] }
  }

  const classifications = finding.rule.map((rule) => ({
    group: finding.domain,
    category: rule,
  })) as unknown as readonly [ExceptionClassification, ...ExceptionClassification[]]

  const determinant = evaluateExceptionRecord<EvaluationSubject>({
    record: { ...record, reason: finding.reason },
    classifications,
    config: policyConfig,
    globalDefault: GLOBAL_DEFAULT_POLICY,
    fieldValue,
  })

  return {
    finding,
    verdict: determinant.verdict,
    missing: determinant.missing as readonly SuppressionRequirement[],
  }
}

/**
 * A one-line, actionable identification of a finding -- its file, line, domain, rule(s), and the
 * canonicalized directive text. Internal to `formatOffender`; callers render an offender through
 * that, so verdict-specific detail is never dropped.
 * @param finding - The finding to describe.
 * @returns A one-line description of `finding`.
 */
function describeFinding(finding: SuppressionFinding): string {
  return `${finding.file}:${String(finding.line)} [${finding.domain}: ${finding.rule.join(", ")}] "${finding.content}"`
}

/**
 * Renders one non-permitted finding's determinant as a rationale line.
 * @param determinant - The finding's evaluated verdict and (if insufficient) missing fields.
 * @returns A one-line, actionable description of why `determinant.finding` failed policy.
 */
export function formatOffender(determinant: SuppressionFindingDeterminant): string {
  const { finding, verdict, missing } = determinant

  if (verdict === "forbidden") {
    return `${describeFinding(finding)} -- forbidden by policy.`
  }
  if (verdict === "unmatched") {
    return `${describeFinding(finding)} -- no reconciled exception record (registry integrity failure).`
  }
  return `${describeFinding(finding)} -- insufficient justification (missing: ${missing.join(", ")}).`
}
