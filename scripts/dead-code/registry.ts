import type { DeadCodeExceptionRecord, DeadCodeFinding, DeadCodeKind } from "./evidence-types.js"
import { deriveDeadCodeId } from "./evidence-types.js"
import type { ExceptionRegistrySchema } from "../shared/exception-record.js"

export type { DeadCodeExceptionRecord } from "./evidence-types.js"

// Keyed by `DeadCodeKind` so `evidence-types.ts` adding a new knip category is a compile error
// here until this set is updated too.
const KIND_SET: Readonly<Record<DeadCodeKind, true>> = {
  "unused-dependency": true,
  "unused-dev-dependency": true,
  "unused-optional-peer-dependency": true,
  "unlisted-dependency": true,
  "unresolved-import": true,
  "unused-export": true,
  "unused-export-namespace": true,
  "unused-type": true,
  "unused-type-namespace": true,
  "unused-namespace-member": true,
  "unused-enum-member": true,
  "unlisted-binary": true,
  "duplicate-export": true,
  "circular-dependency": true,
  "unused-file": true,
}
const KINDS = Object.keys(KIND_SET) as readonly DeadCodeKind[]

/**
 * Builds a fresh, blank exception record for a finding with no matching record yet.
 * @param finding - The unmatched finding.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createDeadCodeStub(finding: DeadCodeFinding, id: string): DeadCodeExceptionRecord {
  return { id, version: 1, justification: "", kind: finding.kind, name: finding.name }
}

/** The per-registry schema for dead-code.json. */
export const DEAD_CODE_EXCEPTION_SCHEMA: ExceptionRegistrySchema<DeadCodeExceptionRecord> = {
  namespace: "dead-code:",
  metadataKeys: ["kind", "name"],
  validateRecord(core, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { kind, name } = raw

    const kindValid = typeof kind === "string" && (KINDS as readonly string[]).includes(kind)
    if (!kindValid) {
      errors.push(
        `${at}.kind must be one of ${KINDS.map((k) => JSON.stringify(k)).join(", ")} (got ${JSON.stringify(kind)}).`,
      )
    }
    const nameValid = typeof name === "string" && name.length > 0
    if (!nameValid) errors.push(`${at}.name must be a non-empty string.`)

    if (!kindValid || !nameValid) return undefined

    const identity = { kind: kind as DeadCodeKind, name }
    const derived = deriveDeadCodeId(identity)
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own kind/name (${JSON.stringify(derived)}).`,
      )
      return undefined
    }

    return { id: core.id, version: 1, justification: core.justification, ...identity }
  },
}
