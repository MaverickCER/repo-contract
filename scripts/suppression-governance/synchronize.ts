import type { DiscoveredSuppression } from "./discover-suppressions.js"
import type { DisableCommentRecord } from "./evidence-types.js"
import { recordIdentity, sortRecords } from "./registry.js"

export type SynchronizedRecordStatus = "new" | "existing" | "moved"

export interface SynchronizedRecord extends DisableCommentRecord {
  readonly status: SynchronizedRecordStatus
}

interface SynchronizeResult {
  readonly records: readonly SynchronizedRecord[]
  readonly newCount: number
  readonly movedCount: number
  readonly removedCount: number
}

interface IdentifiableSuppression {
  readonly file: string
  readonly domain: string
  readonly rule: readonly string[]
  readonly content: string
}

/**
 * A suppression's identity without its line -- used to group candidates for move detection.
 * @param item - The suppression (existing record or freshly discovered) to identify.
 * @returns A string uniquely identifying `(file, domain, rule, content)`.
 */
function identityWithoutLine(item: IdentifiableSuppression): string {
  return JSON.stringify([item.file, item.domain, item.rule, item.content])
}

/**
 * Groups `items` by a derived string key, preserving each group's relative order.
 * @param items - The items to group.
 * @param keyOf - Derives one item's group key.
 * @returns A map from key to every item sharing it.
 */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }
  return groups
}

/**
 * The registry diff/merge engine -- reconciles the previously-synchronized `existing` records
 * against this run's freshly `discovered` suppressions, in three passes:
 *
 * 1. **Exact match**: an existing record whose `(file, line, domain, rule, content)` identity is
 *    found unchanged in `discovered` is preserved (`status: "existing"`), every hand-authored
 *    field intact -- `justification`/`alternatives`/`remediation`/`category`/`verificationMethod`
 *    -- except `reason`, which is never preserved verbatim: it's retaken from this run's freshly
 *    discovered item every time (see evidence-types.ts's `DisableCommentRecord` doc comment on
 *    why), though since it's a pure function of `content` (unchanged here by definition of "exact
 *    match") this only matters if a recognizer's own extraction logic changes between runs.
 * 2. **Move detection**, over what's left from pass 1, grouped by identity *without* `line`: a
 *    group with exactly one leftover existing record and exactly one leftover discovered
 *    suppression is an unambiguous move -- the new record takes the discovered `line`, keeps every
 *    hand-authored field from the existing record (`justification`/`alternatives`/`remediation`/
 *    `category`/`verificationMethod`, `status: "moved"`). A group with more than one leftover on
 *    either side is ambiguous, and **no nearest-line or best-guess matching is ever attempted** --
 *    every member of an ambiguous group falls through to new/removed instead, so an automated
 *    registry can never silently transfer justification from one suppression to a different one
 *    just because they happen to be near each other.
 * 3. Anything discovered and still unmatched becomes a brand-new record (every hand-authored field
 *    -- `justification`/`alternatives`/`remediation`/`category`/`verificationMethod` -- `""`,
 *    `status: "new"`); anything existing and still unmatched is dropped (removed).
 * @param existing - The previously-synchronized registry records (already validated).
 * @param discovered - This run's freshly discovered suppressions.
 * @returns The reconciled, deterministically-sorted records, plus new/moved/removed counts.
 */
export function synchronize(
  existing: readonly DisableCommentRecord[],
  discovered: readonly DiscoveredSuppression[],
): SynchronizeResult {
  const existingByIdentity = new Map(existing.map((record) => [recordIdentity(record), record]))
  const consumedIdentities = new Set<string>()

  // Two discovered suppressions with a byte-identical
  // `(file, line, domain, rule, content)` identity -- e.g.
  // `/* eslint-disable-line no-console */ /* eslint-disable-line no-console */`
  // on one physical line -- are indistinguishable, and the registry
  // (`disable-comments.json`) can only represent one. Collapsing them here
  // keeps every downstream pass from emitting a duplicate record that
  // `validateSuppressionRegistry`'s own duplicate check would then reject on
  // the following run, wedging the check until a human edits the file.
  const seenDiscoveredIdentities = new Set<string>()
  const uniqueDiscovered = discovered.filter((item) => {
    const key = recordIdentity(item)
    if (seenDiscoveredIdentities.has(key)) return false
    seenDiscoveredIdentities.add(key)
    return true
  })

  const result: SynchronizedRecord[] = []
  const remainderDiscovered: DiscoveredSuppression[] = []

  for (const item of uniqueDiscovered) {
    const key = recordIdentity(item)
    const match = existingByIdentity.get(key)
    if (match) {
      consumedIdentities.add(key)
      // `match` is a full DisableCommentRecord, so category/verificationMethod (and
      // justification/alternatives/remediation) ride through this spread automatically -- only
      // `reason` is deliberately overridden below, never any other field.
      result.push({ ...match, reason: item.reason, status: "existing" })
      continue
    }
    remainderDiscovered.push(item)
  }

  const remainderExisting = existing.filter(
    (record) => !consumedIdentities.has(recordIdentity(record)),
  )

  const existingGroups = groupBy(remainderExisting, identityWithoutLine)
  const discoveredGroups = groupBy(remainderDiscovered, identityWithoutLine)
  const handledGroupKeys = new Set<string>()

  let newCount = 0
  let movedCount = 0
  let removedCount = 0

  for (const [key, existingGroup] of existingGroups) {
    const discoveredGroup = discoveredGroups.get(key) ?? []
    handledGroupKeys.add(key)

    if (existingGroup.length === 1 && discoveredGroup.length === 1) {
      const [existingRecord] = existingGroup as [DisableCommentRecord]
      const [discoveredItem] = discoveredGroup as [DiscoveredSuppression]
      result.push({
        ...discoveredItem,
        justification: existingRecord.justification,
        alternatives: existingRecord.alternatives,
        remediation: existingRecord.remediation,
        category: existingRecord.category,
        verificationMethod: existingRecord.verificationMethod,
        status: "moved",
      })
      movedCount += 1
      continue
    }

    removedCount += existingGroup.length
    for (const item of discoveredGroup) {
      result.push({
        ...item,
        justification: "",
        alternatives: "",
        remediation: "",
        category: "",
        verificationMethod: "",
        status: "new",
      })
      newCount += 1
    }
  }

  for (const [key, discoveredGroup] of discoveredGroups) {
    if (handledGroupKeys.has(key)) continue
    for (const item of discoveredGroup) {
      result.push({
        ...item,
        justification: "",
        alternatives: "",
        remediation: "",
        category: "",
        verificationMethod: "",
        status: "new",
      })
      newCount += 1
    }
  }

  return { records: sortRecords(result), newCount, movedCount, removedCount }
}
