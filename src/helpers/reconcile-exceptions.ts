/**
 * The registry-lifecycle half of `repo-contract/helpers` -- `reconcileExceptions` diffs a check's
 * raw findings against its already-loaded exception registry, and `serializeExceptionRegistry`
 * renders the reconciled records back to their canonical on-disk form. Both are pure; the only
 * I/O is `writeExceptionRegistry` in its own module. See
 * specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
 * surface" section for the model these serve: a check emits 100% of its findings, reconciliation
 * maintains one record per finding (a fresh stub for a new one), and stale records are surfaced,
 * never removed.
 */

/**
 * The three fields every exception record in `.repo-contract/exceptions/*.json` carries, whatever
 * the owning check. A registry adds its own typed fields on top; this is the shared core the
 * generic machinery (`reconcileExceptions`, `serializeExceptionRegistry`,
 * `validateExceptionRegistry` in the check-owned layer) relies on.
 */
export interface ExceptionRecordCore {
  /** The check-namespaced semantic identity of the finding this record waives (e.g. `"suppression:eslint:no-console:src/foo.ts:<module>"`). Equals the finding id; a record whose id matches no current finding is stale. Never derived from prose. */
  readonly id: string
  /** Record-schema version. */
  readonly version: number
  /** The one human-authored field: why this guardrail is deliberately bypassed, and what was checked to confirm the finding is real. `""` in a freshly scaffolded stub (the policy, not the validator, rejects a blank/placeholder value). */
  readonly justification: string
}

/** The outcome of reconciling one run's findings against one exception registry. */
export interface ExceptionReconciliation<TFinding, TRecord> {
  /** Each finding paired with the existing record it matched, in `findings` order. */
  readonly matchedPairs: readonly { readonly finding: TFinding; readonly record: TRecord }[]
  /** Every record to persist as live: matched records verbatim, plus one fresh `createStub` per unmatched finding. Never contains a stale record. */
  readonly activeRecords: readonly TRecord[]
  /** Existing records whose id matched no finding this run -- surfaced for the policy to fail on, **never removed** by this function (retiring one is an explicit human edit). */
  readonly staleRecords: readonly TRecord[]
  /** The ids of the stubs created this run -- a subset of `activeRecords`' ids. */
  readonly newStubIds: readonly string[]
}

/**
 * Reconciles this run's raw findings against the check's already-loaded, already-validated
 * exception registry. Pure and add-only: it never mutates a matched record and never removes a
 * stale one.
 *
 * `deriveId` must be **injective** over `findings` -- every independently-governable finding needs
 * a distinct id, or the mechanism cannot tell which finding a record's `justification` belongs to.
 * A collision is returned as `{ ok: false }` (a real condition a check must surface: the source
 * genuinely holds two identical directives), naming both finding indices so the check can point a
 * developer at them.
 *
 * `createStub(finding, id)` is handed the canonical id and its result's `id` is asserted equal to
 * it -- a `createStub` that derives its own identity differently is a `{ ok: false }` bug report,
 * never a silently-mismatched record.
 *
 * Precondition: `existing` has already passed the check's registry validator (unique ids, correct
 * namespace). This function does not re-validate it.
 * @param input - The already-loaded registry, this run's findings, and the check-owned identity + stub callbacks.
 * @param input.existing - The validated records currently on disk.
 * @param input.findings - Every raw finding this run produced -- nothing filtered.
 * @param input.deriveId - The finding's check-namespaced semantic id. Must be injective over `findings`.
 * @param input.createStub - Builds a fresh record for an unmatched finding; receives the canonical id and must return a record carrying it.
 * @returns The reconciliation, or the first integrity problem found.
 */
export function reconcileExceptions<TFinding, TRecord extends { readonly id: string }>(input: {
  readonly existing: readonly TRecord[]
  readonly findings: readonly TFinding[]
  readonly deriveId: (finding: TFinding) => string
  readonly createStub: (finding: TFinding, id: string) => TRecord
}):
  | { readonly ok: true; readonly reconciliation: ExceptionReconciliation<TFinding, TRecord> }
  | { readonly ok: false; readonly error: string } {
  const { existing, findings, deriveId, createStub } = input

  const idByFirstIndex = new Map<string, number>()
  const identified: { readonly finding: TFinding; readonly id: string }[] = []
  for (const [index, finding] of findings.entries()) {
    const id = deriveId(finding)
    const prior = idByFirstIndex.get(id)
    if (prior !== undefined) {
      return {
        ok: false,
        error: `deriveId is not injective: findings at index ${String(prior)} and ${String(index)} both map to id ${JSON.stringify(id)} -- every independently-governable finding must have a distinct id; make the two directives distinguishable.`,
      }
    }
    idByFirstIndex.set(id, index)
    identified.push({ finding, id })
  }

  const existingById = new Map<string, TRecord>()
  for (const record of existing) existingById.set(record.id, record)

  const matchedPairs: { readonly finding: TFinding; readonly record: TRecord }[] = []
  const activeRecords: TRecord[] = []
  const newStubIds: string[] = []

  for (const { finding, id } of identified) {
    const match = existingById.get(id)
    if (match !== undefined) {
      matchedPairs.push({ finding, record: match })
      activeRecords.push(match)
      continue
    }
    const stub = createStub(finding, id)
    if (stub.id !== id) {
      return {
        ok: false,
        error: `createStub returned a record whose id ${JSON.stringify(stub.id)} does not equal the canonical id ${JSON.stringify(id)} it was given.`,
      }
    }
    activeRecords.push(stub)
    newStubIds.push(id)
  }

  const liveIds = new Set(idByFirstIndex.keys())
  const staleRecords = existing.filter((record) => !liveIds.has(record.id))

  return {
    ok: true,
    reconciliation: { matchedPairs, activeRecords, staleRecords, newStubIds },
  }
}

/**
 * Rebuilds one record with a canonical key order: `id`, `version`, `justification`, then every
 * other own key in code-unit order. Records are flat (scalars and scalar arrays); if a registry
 * ever adds a nested metadata object, its inner keys keep their insertion order until this
 * function is extended. Keys are copied with `Object.defineProperty` so an own `"__proto__"` key
 * is carried through as a plain data property rather than silently dropped by the setter (and the
 * prototype is never mutated).
 * @param record - The record to reorder.
 * @returns A new object with the same entries in canonical key order.
 */
function canonicalRecord(
  record: Record<string, unknown> & { readonly id: string },
): Record<string, unknown> {
  const { id, version, justification, ...rest } = record
  const ordered: Record<string, unknown> = { id, version, justification }
  for (const key of Object.keys(rest).sort()) {
    // `Object.defineProperty`, not `ordered[key] = ...`, so an own `"__proto__"` key is stored as
    // a plain enumerable data property instead of being swallowed by the prototype setter. The
    // resulting object is only serialized and discarded, so leaving `writable`/`configurable` at
    // their `false` defaults is fine.
    Object.defineProperty(ordered, key, { value: rest[key], enumerable: true })
  }
  return ordered
}

/**
 * The canonical on-disk form of one exception registry: `{ "exceptions": [ ... ] }`, records
 * sorted ascending by `id` (code-unit order, locale-independent), each record's keys in
 * `canonicalRecord` order, 2-space indent, `\n` line endings, a trailing newline. Fully
 * deterministic: the same records always serialize byte-for-byte identically, so a reconcile that
 * changes nothing produces no diff and `writeExceptionRegistry` writes nothing.
 *
 * Assumes `records` have unique ids (the caller reconciled them and validated its registry).
 * @param records - The reconciled records (`activeRecords` plus any `staleRecords`, in any order).
 * @returns The exact file contents to persist.
 */
export function serializeExceptionRegistry(
  records: readonly (Record<string, unknown> & { readonly id: string })[],
): string {
  // `records` have unique ids by precondition, so the `<`/`<=` and `>`/`>=` mutants of this
  // comparator, and its `: 0` (tie) branch, are all equivalent -- no two ids ever compare equal.
  // The reversing mutants (swapped `-1`/`1`, the `true`/`false` conditional replacements) are
  // killed by the "byte-identical regardless of record order" property test, which serializes a
  // list and its reverse and requires identical bytes. Comparing the `id` strings directly (not
  // the records) also keeps this safe for null-prototype record objects.
  // Stryker disable next-line ConditionalExpression,EqualityOperator -- equivalent mutants, see comment above.
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const canonical = sorted.map((record) => canonicalRecord(record))
  return `${JSON.stringify({ exceptions: canonical }, null, 2)}\n`
}
