import type { ExceptionDeterminant } from "../../src/helpers/index.js"

/**
 * Matches this run's tool findings against this run's loaded exception registry, and aggregates
 * the result -- the check-owned layer `src/helpers/exception-policy.ts` deliberately excludes
 * (see specs/decisions/0013-reusable-exception-policy-helper.md): matching a finding to a record
 * is check-specific (a Socket.dev alert matches by its own stable id; a network-capability
 * finding matches by `capability:file:line`), so it stays a caller-supplied `matchRecord`
 * callback here rather than anything this module or `src/helpers` decides on its own.
 *
 * Aggregates the two named directions of drift a registry and a run's real findings can fall
 * into relative to each other: an `unmatchedFindings` entry (a finding this run actually observed,
 * in exception-eligible territory, with no registry record backing it) and a `staleExceptions`
 * entry (a registry record that matched nothing this run -- either the underlying finding is
 * gone, or the record's own matching fields have drifted out of sync with it). Both are named
 * explicitly in the return shape rather than silently dropped, so a check's own policy can report
 * each by name.
 * @param input - This run's findings and loaded registry records, plus the check-owned matching and per-pair evaluation callbacks.
 * @param input.items - This run's tool findings.
 * @param input.records - This run's loaded exception registry.
 * @param input.matchRecord - Finds the (at most one) record in `input.records` that backs `item`, or `undefined` if none does. Entirely check-owned -- this module never guesses at matching.
 * @param input.evaluate - Wraps `evaluateExceptionRecord` (see `src/helpers/exception-policy.ts`) for one already-matched `(item, record)` pair.
 * @returns Every matched pair with its determinant, every unmatched finding, every stale (matched-nothing) record, and a shape-agnostic count summary.
 */
export function evaluateExceptionFindings<TItem, TRecord>(input: {
  readonly items: readonly TItem[]
  readonly records: readonly TRecord[]
  readonly matchRecord: (item: TItem, records: readonly TRecord[]) => TRecord | undefined
  readonly evaluate: (item: TItem, record: TRecord) => ExceptionDeterminant<TRecord>
}): {
  readonly matched: readonly {
    readonly item: TItem
    readonly determinant: ExceptionDeterminant<TRecord>
  }[]
  readonly unmatchedFindings: readonly TItem[]
  readonly staleExceptions: readonly TRecord[]
  readonly summary: string
} {
  const { items, records, matchRecord, evaluate } = input

  const matched: { readonly item: TItem; readonly determinant: ExceptionDeterminant<TRecord> }[] =
    []
  const unmatchedFindings: TItem[] = []
  const usedRecords = new Set<TRecord>()

  for (const item of items) {
    const record = matchRecord(item, records)
    if (record === undefined) {
      unmatchedFindings.push(item)
      continue
    }
    usedRecords.add(record)
    matched.push({ item, determinant: evaluate(item, record) })
  }

  const staleExceptions = records.filter((record) => !usedRecords.has(record))

  const forbiddenCount = matched.filter(
    ({ determinant }) => determinant.verdict === "forbidden",
  ).length
  const insufficientCount = matched.filter(
    ({ determinant }) => determinant.verdict === "insufficient",
  ).length
  const permittedCount = matched.filter(
    ({ determinant }) => determinant.verdict === "permitted",
  ).length

  const summary =
    `${String(items.length)} finding(s) evaluated: ${String(permittedCount)} permitted, ` +
    `${String(forbiddenCount)} forbidden, ${String(insufficientCount)} insufficient, ` +
    `${String(unmatchedFindings.length)} unmatched (no registry record), ` +
    `${String(staleExceptions.length)} stale exception record(s) (matched nothing this run).`

  return { matched, unmatchedFindings, staleExceptions, summary }
}

// Re-exported from its home in `scripts/shared/exception-record.ts` (a lower layer `checks/` may
// import) so the three security checks here keep importing it from this module unchanged, while
// `scripts/suppression-governance/` -- which cannot import `checks/` -- can reach it too.
export { stageMissingFields } from "../../scripts/shared/exception-record.js"
