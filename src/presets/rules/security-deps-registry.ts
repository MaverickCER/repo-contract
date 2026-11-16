import { notImplemented } from "../../not-implemented.js"
import type {
  ExceptionRegistrySchema,
  ExceptionV2Fields,
  SecurityExceptionFields,
} from "../../helpers/exception-record.js"
import type { PersistedExceptionRegistry } from "../../helpers/persist-exception-registry.js"
import type { PolicyResult } from "../../types.js"

/** An `npm audit` severity, or `"unknown"` for a value npm did not document. */
export type AuditSeverity = "info" | "low" | "moderate" | "high" | "critical" | "unknown"

/** One vulnerable package, as `npm audit` groups advisories. */
export interface AuditFinding {
  /** `security-deps:<package>@<range>`. */
  readonly id: string
  readonly package: string
  readonly range: string
  readonly severity: AuditSeverity
}

/** One `security-deps.json` record. */
export interface SecurityDepsExceptionRecord
  extends SecurityExceptionFields, Partial<ExceptionV2Fields> {
  readonly id: string
  readonly version: 1 | 2
  readonly justification: string
  readonly package: string
  readonly range: string
  readonly severity: AuditSeverity
}

/**
 * Validates `security-deps:` records: the security fields, the v2 fields and `package`, `range`
 * and `severity`. Every exception type is accepted.
 */
export const SECURITY_DEPS_EXCEPTION_SCHEMA: ExceptionRegistrySchema<SecurityDepsExceptionRecord> =
  {
    namespace: "security-deps:",
    metadataKeys: [],
    validateRecord: () => {
      return notImplemented("R2x")
    },
  }

/**
 * @param finding - the vulnerable package.
 * @param finding.package - its name.
 * @param finding.range - the vulnerable range npm reports.
 * @returns `security-deps:<package>@<range>`, stable while the same range is reported.
 */
export function securityDepsExceptionId(finding: {
  readonly package: string
  readonly range: string
}): string {
  return notImplemented("R2x", finding)
}

/**
 * @param report - the parsed `npm audit --json` output.
 * @returns one finding per vulnerable package, `info` included.
 */
export function normalizeAuditFindings(report: unknown): readonly AuditFinding[] {
  return notImplemented("R2x", report)
}

/**
 * @param finding - a finding with no record yet.
 * @param id - its id.
 * @returns a blank `version: 2` record.
 */
export function createSecurityDepsStub(
  finding: AuditFinding,
  id: string,
): SecurityDepsExceptionRecord {
  return notImplemented("R2x", finding, id)
}

/**
 * Judges the findings against the reconciled registry. A `critical` advisory fails whatever its
 * record says. A lower one passes only with a complete record. A stale record fails. `info` is
 * reported and never blocks.
 * @param findings - this run's findings.
 * @param registry - the registry after reconciliation.
 * @returns the verdict.
 */
export function judgeAuditFindings(
  findings: readonly AuditFinding[],
  registry: PersistedExceptionRegistry<SecurityDepsExceptionRecord>,
): PolicyResult {
  return notImplemented("R2x", findings, registry)
}
