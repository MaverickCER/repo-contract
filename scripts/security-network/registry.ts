import type {
  NetworkCapabilityFinding,
  NetworkCapabilityKind,
  NetworkExceptionRecord,
} from "./evidence-types.js"
import {
  EXCEPTION_TYPES,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateSecurityExceptionFields,
} from "../shared/exception-record.js"
import type { ExceptionRegistrySchema, ExceptionType } from "../shared/exception-record.js"

export type { NetworkExceptionRecord } from "./evidence-types.js"

// Keyed by `NetworkCapabilityKind` so `evidence-types.ts` adding a new kind is a compile error
// here until this set is updated too.
const CAPABILITY_KIND_SET: Readonly<Record<NetworkCapabilityKind, true>> = {
  "restricted-module-import": true,
  "restricted-named-import": true,
  "restricted-global-usage": true,
  "dynamic-import-non-literal-specifier": true,
  "non-literal-preset-command": true,
  "unreviewed-preset-command": true,
}
const CAPABILITY_KINDS = Object.keys(CAPABILITY_KIND_SET) as readonly NetworkCapabilityKind[]

/** Every `EXCEPTION_TYPES` member is a valid reason to waive a real, reviewed network-capability finding. */
const ALLOWED_EXCEPTION_TYPES: readonly ExceptionType[] = EXCEPTION_TYPES

/**
 * The check-namespaced semantic identity of one network-capability finding:
 * `security-network:<capability>:<file>:<line>:<column>`. Per-syntax-position, so injective over a
 * run's findings; churns when the offending line/column moves (ADR 0013's line-in-id note).
 * @param finding - The finding's (or record's) identity fields.
 * @param finding.capability - Which prohibited capability kind this is.
 * @param finding.file - The offending file's repo-relative POSIX path.
 * @param finding.line - The 1-based line of the offending syntax.
 * @param finding.column - The 1-based column of the offending syntax.
 * @returns The semantic id.
 */
export function deriveNetworkExceptionId(finding: {
  readonly capability: NetworkCapabilityKind
  readonly file: string
  readonly line: number
  readonly column: number
}): string {
  return `security-network:${finding.capability}:${finding.file}:${String(finding.line)}:${String(finding.column)}`
}

/**
 * Builds a fresh, blank exception record for a finding with no matching record yet.
 * @param finding - The unmatched finding.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createNetworkStub(
  finding: NetworkCapabilityFinding,
  id: string,
): NetworkExceptionRecord {
  return {
    id,
    version: 1,
    justification: "",
    alternatives: "",
    remediation: "",
    method: "",
    exceptionType: "",
    capability: finding.capability,
    file: finding.file,
    line: finding.line,
    column: finding.column,
  }
}

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[/\\]/

/**
 * Whether `file` is a non-empty, repository-relative POSIX path with no `..` segments.
 * @param file - The candidate path.
 * @returns `true` if `file` is well-formed and repo-relative.
 */
function isWellFormedRepoRelativePath(file: string): boolean {
  if (file.length === 0) return false
  if (file.startsWith("/") || WINDOWS_DRIVE_PATH.test(file)) return false
  if (file.includes("\\")) return false
  return !file.split("/").includes("..")
}

/** The per-registry schema for security-network.json, plugged into the generic `validateExceptionRegistry`. */
export const NETWORK_EXCEPTION_SCHEMA: ExceptionRegistrySchema<NetworkExceptionRecord> = {
  namespace: "security-network:",
  metadataKeys: [...SECURITY_EXCEPTION_FIELD_KEYS, "capability", "file", "line", "column"],
  validateRecord(core, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { capability, file, line, column } = raw

    const capabilityValid =
      typeof capability === "string" && (CAPABILITY_KINDS as readonly string[]).includes(capability)
    if (!capabilityValid) {
      errors.push(
        `${at}.capability must be one of ${CAPABILITY_KINDS.map((c) => JSON.stringify(c)).join(", ")} (got ${JSON.stringify(capability)}).`,
      )
    }
    const fileValid = typeof file === "string" && isWellFormedRepoRelativePath(file)
    if (!fileValid) {
      errors.push(
        `${at}.file must be a non-empty, repository-relative POSIX path with no ".." segments (got ${JSON.stringify(file)}).`,
      )
    }
    const lineValid = typeof line === "number" && Number.isInteger(line) && line >= 1
    if (!lineValid)
      errors.push(`${at}.line must be a positive integer (got ${JSON.stringify(line)}).`)
    const columnValid = typeof column === "number" && Number.isInteger(column) && column >= 1
    if (!columnValid) {
      errors.push(`${at}.column must be a positive integer (got ${JSON.stringify(column)}).`)
    }

    const security = validateSecurityExceptionFields(raw, index, ALLOWED_EXCEPTION_TYPES, errors)

    if (!capabilityValid || !fileValid || !lineValid || !columnValid || security === undefined) {
      return undefined
    }

    const identity = {
      capability: capability as NetworkCapabilityKind,
      file: file,
      line: line,
      column: column,
    }
    const derived = deriveNetworkExceptionId(identity)
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own capability/file/line/column (${JSON.stringify(derived)}).`,
      )
      return undefined
    }

    return {
      id: core.id,
      version: 1,
      justification: core.justification,
      ...security,
      ...identity,
    }
  },
}
