import { hashRequirementFields } from "../../src/helpers/index.js"

/**
 * The small, closed vocabulary of *why* an exception is legitimate -- deliberately short, and
 * owned here in `scripts/shared/` (unpublished), never in `src/helpers/**` (published): the
 * generic core has no opinion about a consumer's own classification of "why", only about which
 * named fields must be non-empty (see `src/helpers/exception-policy.ts`'s `ExceptionPolicy`). A
 * ~150-term cross-organization taxonomy (privacy, SRE, compliance, cost, etc.) was considered and
 * rejected for this repository's actual scale -- see specs/decisions/0013-reusable-exception-policy-helper.md
 * for the reasoning. Each retrofitted check may narrow which members apply to it (e.g. a
 * dependency-advisory check excluding `"validated-false-positive"`, since an advisory either
 * applies to the installed version or it doesn't -- there is no "false positive" reading of an
 * advisory the way there is for a static-analysis finding).
 *
 * - `"validated-false-positive"`: the finding does not actually apply here. Only satisfiable by an
 *   `ExceptionVerification` whose `method` is `"mechanical-reverification"` -- re-running the same
 *   tool that raised the finding, scoped narrowly, and confirming it no longer fires. Never
 *   satisfiable by opinion alone; see `ExceptionVerification`'s own doc comment.
 * - `"accepted-risk"`: the finding is real, and is knowingly tolerated.
 * - `"compensating-control"`: a different, already-in-place mitigation covers the same risk.
 * - `"tooling-limitation"`: the finding is an artifact of the scanning tool itself (e.g. a known
 *   upstream false-positive pattern), not of this codebase's own behavior.
 * - `"scheduled-remediation"`: the fix is planned and tracked, not yet landed.
 * - `"platform-or-vendor-constraint"`: the finding cannot be resolved without a change outside
 *   this repository's own control (an upstream dependency, a platform API).
 */
export const EXCEPTION_TYPES = [
  "validated-false-positive",
  "accepted-risk",
  "compensating-control",
  "tooling-limitation",
  "scheduled-remediation",
  "platform-or-vendor-constraint",
] as const

/**
 * A second, independently-satisfiable, content-bound gate on top of a record's ordinary prose
 * fields -- the fix for ADR 0006's "proves a suppression was described, never that it was
 * examined" gap (see specs/decisions/0013-reusable-exception-policy-helper.md). `verifiedContentHash`
 * is `hashRequirementFields()` (see `src/helpers/exception-policy.ts`) computed over the record's
 * prose/classification fields *at the moment of verification*; a retrofitted check's own
 * `fieldValue` implementation recomputes that same hash on every run and delegates
 * `"verification.verifiedBy"` to `isVerified` below, so editing a verified field afterward makes
 * the recomputed hash stop matching -- `"verification.verifiedBy"` silently reverts to "missing"
 * and the record fails again, with no separate staleness-tracking logic anywhere.
 */
export interface ExceptionVerification {
  /**
   * `"mechanical-reverification"`: real, tool-backed evidence -- the same tool that raised the
   * finding, re-run narrowly, confirms it no longer applies (or applies differently than
   * claimed). Required outright for `exceptionType: "validated-false-positive"`. `"independent-
   * human-review"`: covers everything mechanical re-verification can't reach (an accepted-risk
   * judgment call, an AI-authored finding with no more-authoritative oracle to re-run against).
   * repo-contract mechanically enforces that this field is present and content-bound; it does not
   * verify that `verifiedBy` is a different person than the record's own author -- that is a
   * GitHub branch-protection/CODEOWNERS concern, not a repo-contract mechanism (see ADR 0011's
   * "don't own ambient platform capabilities you don't need" posture).
   */
  readonly method: "mechanical-reverification" | "independent-human-review"
  /** Who (or what mechanical process) performed the verification. */
  readonly verifiedBy: string
  /** ISO 8601 timestamp of when the verification was performed. */
  readonly verifiedAt: string
  /** `hashRequirementFields()` over the record's prose/classification fields, computed at the moment of verification -- see this interface's own doc comment for how staleness is detected from this alone. */
  readonly verifiedContentHash: string
  /** Optional supporting evidence, e.g. a re-run's report path/hash, or a PR review URL. */
  readonly evidence?: string
}

// A deliberately flat shape gate -- a `YYYY-MM-DD` prefix followed only by the character set an
// ISO time/zone suffix can use. One character class, one bounded `{4}`/`{2}`, one `*`: no nested
// quantifiers, so no catastrophic-backtracking surface. It keeps out non-ISO-shaped strings
// `Date.parse` would otherwise accept (`"Jan 1 2026"`, `"2026/01/01"`); the date part and the
// time part are then each validated explicitly below.
const ISO_8601_SHAPE = /^\d{4}-\d{2}-\d{2}[T \d:.Z+-]*$/

/**
 * Whether `y`-`m`-`d` is a real Gregorian calendar date -- month 1-12, day within that month's
 * real length (leap years included). Done by hand rather than via `Date`: `Date.parse` and the
 * `Date` constructor both *normalize* an overflow (`2026-02-29` silently becomes `2026-03-01`)
 * instead of rejecting it, so an impossible `verifiedAt` would otherwise pass validation.
 * @param y - Four-digit year.
 * @param m - Month, 1-12.
 * @param d - Day of month, 1-31.
 * @returns `true` if the date exists on the Gregorian calendar.
 */
function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= (lengths[m - 1] ?? 0)
}

/**
 * Whether `value` is a well-formed ISO 8601 date or date-time -- an ISO-shape check, an explicit
 * real-Gregorian-calendar check on the `YYYY-MM-DD` part (so `"2026-02-29"` and `"2026-13-45"`
 * both fail), and `Date.parse` for the optional time/offset part (so `"2026-01-01Tnope"` and
 * `"later"` fail). Every `ExceptionVerification.verifiedAt` is validated with this at
 * registry-load time: a free-text or impossible timestamp must never be able to back an
 * exception.
 * @param value - The candidate timestamp string.
 * @returns `true` if `value` is a valid ISO 8601 date/date-time.
 */
export function isIso8601Timestamp(value: string): boolean {
  // `$` in a non-`m` regex still matches *before* a single trailing newline, so `ISO_8601_SHAPE`
  // alone would accept `"2026-01-01\n"` (which `Date.parse` then also tolerates). Reject any line
  // terminator outright before the shape check.
  if (/[\r\n]/.test(value) || !ISO_8601_SHAPE.test(value)) return false
  const [year, month, day] = value.slice(0, 10).split("-").map(Number) as [number, number, number]
  if (!isRealCalendarDate(year, month, day)) return false
  return !Number.isNaN(Date.parse(value))
}

/**
 * Whether `record`'s own stored addressing key matches what `deriveId` independently recomputes
 * from its embedded finding-identity fields -- a stored key that doesn't match its own claimed
 * identity is a registry bug, caught here at load/validation time rather than silently trusted.
 * `deriveId` is entirely consumer-supplied, one per check, and free to compound however many of
 * the record's own fields it needs (e.g. a dependency-advisory check: `` `${advisoryId}:
 * ${packageName}` ``; a network-capability check: `` `${capability}:${file}:${line}` ``) --
 * `scripts/shared/` never hardcodes a derivation shape or a fixed set of key fields, it only calls
 * `deriveId(record)` and compares the result against `record.id`.
 * @param record - The record whose own stored `id` is checked for self-consistency.
 * @param deriveId - Recomputes what `record`'s `id` should be, from its own embedded finding-identity fields.
 * @returns `{ ok: true }` if `record.id` matches `deriveId(record)`; otherwise `{ ok: false, error }`.
 */
export function validateCanonicalIdentity<TRecord extends { readonly id: string }>(
  record: TRecord,
  deriveId: (record: TRecord) => string,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const derived = deriveId(record)
  if (derived === record.id) return { ok: true }

  return {
    ok: false,
    error: `Record's stored id ${JSON.stringify(record.id)} does not match its own derived identity ${JSON.stringify(derived)} -- this record's addressing key is inconsistent with its own embedded finding-identity fields.`,
  }
}

/**
 * The content-bound check described in `ExceptionVerification`'s own doc comment: `record` is
 * verified only if it carries a `verification` block whose `verifiedContentHash` still matches
 * `hashRequirementFields()` recomputed from `record`'s *current* `proseRequirements` field
 * values. Every retrofitted check's own `fieldValue` implementation delegates the
 * `"verification.verifiedBy"` requirement to this function (returning `record.verification
 * .verifiedBy` when `isVerified` is `true`, and `""` otherwise) -- so `src/helpers/exception-
 * policy.ts`'s generic core still only ever sees "a named field, trimmed, non-empty," never
 * anything about hashing or content-binding.
 * @param record - The record to check.
 * @param proseRequirements - Which fields' current values the verification's hash must still match -- the same field names (and order) used when the hash was originally computed.
 * @param fieldValue - Resolves one named field's current string value on `record`, exactly like `evaluateExceptionRecord`'s own `fieldValue` parameter.
 * @returns `true` if `record` carries a `verification` block whose hash still matches its own current prose; `false` otherwise (no verification at all, or a stale one).
 */
export function isVerified<TRecord extends { readonly verification?: ExceptionVerification }>(
  record: TRecord,
  proseRequirements: readonly string[],
  fieldValue: (record: TRecord, requirement: string) => string,
): boolean {
  const { verification } = record
  if (verification === undefined) return false

  return (
    verification.verifiedContentHash ===
    hashRequirementFields(record, proseRequirements, fieldValue)
  )
}

/**
 * A cheap `Map` index over `records` by their own stored `id` -- a convenience for a check that
 * needs to look a record up by id repeatedly, not a correctness requirement (`Array.find` is
 * equally correct, just O(n); these registries hold tens of hand-maintained records, not
 * thousands -- see specs/decisions/0013-reusable-exception-policy-helper.md's explicit rejection
 * of an O(1)-only mandate).
 * @param records - The records to index.
 * @returns A `Map` from each record's own `id` to the record itself. When two records share an `id`, the later one in `records` wins -- the same "last write wins" semantics a plain object literal or `Map` construction from entries always has.
 */
export function indexRecordsById<TRecord extends { readonly id: string }>(
  records: readonly TRecord[],
): ReadonlyMap<string, TRecord> {
  return new Map(records.map((record) => [record.id, record]))
}

/**
 * Stages a record's raw `missing` list (`ExceptionDeterminant.missing`, from
 * `evaluateExceptionRecord`) for presentation, per the user's own explicit direction
 * (specs/decisions/0013-reusable-exception-policy-helper.md, "Verification, not attestation"):
 * the verification field (e.g. `"verification.verifiedBy"` for the security checks, `"verifiedBy"`
 * for suppression-governance) is a genuinely required field the whole time --
 * `evaluateExceptionRecord`'s own pass/fail semantics never change -- but a record's first-ever
 * reported failure should ask only for the authoring-phase fields (`justification`,
 * `alternatives`, ...), never simultaneously demand a sign-off on prose that doesn't exist yet.
 * Once every other required field is filled in, the next run's staged list additionally names
 * `verificationField` -- purely a presentation choice, so `src/helpers`'s own published contract
 * stays untouched.
 * @param missing - A record's raw `missing` list, exactly as `evaluateExceptionRecord` returned it.
 * @param verificationField - The verification requirement's own field name to stage.
 * @returns `missing` with `verificationField` filtered out, unless every other entry is already satisfied (in which case `missing` is returned unchanged).
 */
export function stageMissingFields(
  missing: readonly string[],
  verificationField: string,
): readonly string[] {
  const authoringMissing = missing.filter((field) => field !== verificationField)
  return authoringMissing.length > 0 ? authoringMissing : missing
}
