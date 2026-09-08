import type { NormalizedSocketAlert, SocketExceptionRecord } from "./evidence-types.js"
import {
  EXCEPTION_TYPES,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateSecurityExceptionFields,
} from "../shared/exception-record.js"
import type { ExceptionRegistrySchema, ExceptionType } from "../shared/exception-record.js"

export type { SocketExceptionRecord } from "./evidence-types.js"

const SEVERITY_VALUES = new Set(["critical", "high", "middle", "low", "unknown"])

/** Every `EXCEPTION_TYPES` member is a valid reason to tolerate a real Socket alert. */
const ALLOWED_EXCEPTION_TYPES: readonly ExceptionType[] = EXCEPTION_TYPES

/**
 * The check-namespaced semantic identity of one Socket alert: `socket:<package>@<version>:<type>`.
 * Injective over a run (Socket does not emit the same package@version:type twice); stable across
 * runs as long as the dependency and alert type are unchanged.
 * @param alert - The alert's (or record's) identity fields.
 * @param alert.package - The npm package name.
 * @param alert.packageVersion - The exact installed version the alert is against.
 * @param alert.type - Socket's own alert type (e.g. `"envVars"`).
 * @returns The semantic id.
 */
export function deriveSocketExceptionId(alert: {
  readonly package: string
  readonly packageVersion: string
  readonly type: string
}): string {
  return `socket:${alert.package}@${alert.packageVersion}:${alert.type}`
}

/**
 * Builds a fresh, blank exception record for an alert with no matching record yet.
 * @param alert - The unmatched alert.
 * @param id - The canonical id `reconcileExceptions` computed (equals `alert.id`).
 * @returns The blank stub record.
 */
export function createSocketStub(alert: NormalizedSocketAlert, id: string): SocketExceptionRecord {
  return {
    id,
    version: 1,
    justification: "",
    alternatives: "",
    remediation: "",
    method: "",
    exceptionType: "",
    package: alert.package,
    packageVersion: alert.version,
    type: alert.type,
    severity: alert.severity,
  }
}

/** The per-registry schema for socket.json. */
export const SOCKET_EXCEPTION_SCHEMA: ExceptionRegistrySchema<SocketExceptionRecord> = {
  namespace: "socket:",
  metadataKeys: [...SECURITY_EXCEPTION_FIELD_KEYS, "package", "packageVersion", "type", "severity"],
  validateRecord(core, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { package: pkg, packageVersion, type, severity } = raw

    const pkgValid = typeof pkg === "string" && pkg.length > 0
    if (!pkgValid) errors.push(`${at}.package must be a non-empty string.`)
    const versionValid = typeof packageVersion === "string" && packageVersion.length > 0
    if (!versionValid) errors.push(`${at}.packageVersion must be a non-empty string.`)
    const typeValid = typeof type === "string" && type.length > 0
    if (!typeValid) errors.push(`${at}.type must be a non-empty string.`)
    const severityValid = typeof severity === "string" && SEVERITY_VALUES.has(severity)
    if (!severityValid) {
      errors.push(
        `${at}.severity must be one of ${[...SEVERITY_VALUES].map((s) => JSON.stringify(s)).join(", ")} (got ${JSON.stringify(severity)}).`,
      )
    }

    const security = validateSecurityExceptionFields(raw, index, ALLOWED_EXCEPTION_TYPES, errors)

    if (!pkgValid || !versionValid || !typeValid || !severityValid || security === undefined) {
      return undefined
    }

    const identity = {
      package: pkg,
      packageVersion: packageVersion,
      type: type,
    }
    const derived = deriveSocketExceptionId(identity)
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own package/packageVersion/type (${JSON.stringify(derived)}).`,
      )
      return undefined
    }

    return {
      id: core.id,
      version: 1,
      justification: core.justification,
      ...security,
      ...identity,
      severity: severity as SocketExceptionRecord["severity"],
    }
  },
}
