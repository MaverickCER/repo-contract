/**
 * The `securityDeps` registry policy: no known vulnerability ships in what users install, unless
 * a complete record in the registry accepts it. A record accepts its own severity and every lower
 * one. A `critical` advisory fails whatever its record
 * says. A record whose advisory is gone is stale and fails. An `info` finding never blocks.
 *
 * Limit: npm groups advisories per package, so one record can cover several advisories.
 */
import {
  EXCEPTION_TYPES,
  EXCEPTION_V2_FIELD_KEYS,
  emptyV2Fields,
  evaluateFindingVerdict,
  isValidNonEmptyStringField,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateSecurityExceptionFields,
} from "../../helpers/exception-record.js"
import type {
  ExceptionRegistrySchema,
  ExceptionV2Fields,
  SecurityExceptionFields,
} from "../../helpers/exception-record.js"
import type { ExceptionPolicy, ExceptionPolicyConfig } from "../../helpers/exception-policy.js"
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

const SEVERITIES: readonly string[] = ["info", "low", "moderate", "high", "critical", "unknown"]

/** Every field a record must fill before it accepts an advisory. */
export const SECURITY_DEPS_REQUIREMENTS = [
  "justification",
  ...SECURITY_EXCEPTION_FIELD_KEYS,
  ...EXCEPTION_V2_FIELD_KEYS,
] as const

/** A `critical` advisory is fixed or removed, never excused; every lower one needs a full record. */
export const SECURITY_DEPS_POLICY: ExceptionPolicyConfig = {
  "security-deps": {
    default: { mode: "exception", requirements: [...SECURITY_DEPS_REQUIREMENTS] },
    rules: { critical: { mode: "forbidden" } },
  },
}

const FALLBACK_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...SECURITY_DEPS_REQUIREMENTS],
}

/**
 * @param value - a candidate value.
 * @returns whether it is a non-`null`, non-array object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validates `security-deps:` records: the security fields, the v2 fields and `package`, `range`
 * and `severity`. Every exception type is accepted.
 */
export const SECURITY_DEPS_EXCEPTION_SCHEMA: ExceptionRegistrySchema<SecurityDepsExceptionRecord> =
  {
    namespace: "security-deps:",
    metadataKeys: [...SECURITY_EXCEPTION_FIELD_KEYS, "package", "range", "severity"],
    validateRecord: (core, raw, index, errors) => {
      const at = `exceptions[${String(index)}]`
      const security = validateSecurityExceptionFields(raw, index, EXCEPTION_TYPES, errors)
      const { package: pkg, range, severity } = raw
      const pkgValid = isValidNonEmptyStringField(pkg, `${at}.package`, errors)
      const rangeValid = isValidNonEmptyStringField(range, `${at}.range`, errors)
      const severityValid = SEVERITIES.includes(severity as string)
      if (!severityValid) {
        errors.push(
          `${at}.severity must be one of ${SEVERITIES.map((s) => JSON.stringify(s)).join(", ")} (got ${JSON.stringify(severity)}).`,
        )
      }
      if (security === undefined || !pkgValid || !rangeValid || !severityValid) return undefined

      const derived = securityDepsExceptionId({ package: pkg, range })
      if (derived !== core.id) {
        errors.push(
          `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own package and range (${JSON.stringify(derived)}).`,
        )
        return undefined
      }
      return {
        id: core.id,
        version: 1,
        justification: core.justification,
        ...security,
        package: pkg,
        range,
        severity: severity as AuditSeverity,
      }
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
  return `security-deps:${finding.package}@${finding.range}`
}

/**
 * A report npm could not finish (a registry or network error) has an `error` and no
 * `vulnerabilities`. Reading it as zero findings would turn a failed scan into a pass.
 * @param report - the parsed `npm audit --json` output.
 * @returns why the report cannot be judged, or `undefined` for a completed report.
 */
export function auditReportProblem(report: unknown): string | undefined {
  if (!isPlainObject(report)) return "npm audit produced invalid JSON report data."
  const { error, vulnerabilities } = report
  if (error !== undefined && error !== null) {
    const detail = isPlainObject(error)
      ? [error.code, error.summary].filter((part) => typeof part === "string").join(": ")
      : ""
    return `npm audit could not complete the scan${detail === "" ? "" : `: ${detail}`}.`
  }
  if (!isPlainObject(vulnerabilities)) {
    return 'npm audit\'s report has no "vulnerabilities" object, so the scan may not have completed.'
  }
  return undefined
}

/**
 * @param report - the parsed `npm audit --json` output.
 * @returns one finding per vulnerable package, `info` included.
 */
export function normalizeAuditFindings(report: unknown): readonly AuditFinding[] {
  const vulnerabilities = isPlainObject(report) ? report.vulnerabilities : undefined
  if (!isPlainObject(vulnerabilities)) return []
  return Object.entries(vulnerabilities).map(([name, vulnerability]) => {
    const advisory = isPlainObject(vulnerability) ? vulnerability : {}
    const severity = SEVERITIES.includes(advisory.severity as string)
      ? (advisory.severity as AuditSeverity)
      : "unknown"
    const range =
      typeof advisory.range === "string" && advisory.range !== "" ? advisory.range : "unknown"
    return {
      id: securityDepsExceptionId({ package: name, range }),
      package: name,
      range,
      severity,
    }
  })
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
  return {
    id,
    version: 2,
    justification: "",
    alternatives: "",
    remediation: "",
    method: "",
    exceptionType: "",
    ...emptyV2Fields(),
    package: finding.package,
    range: finding.range,
    severity: finding.severity,
  }
}

/**
 * Whether a record was written for a milder advisory than npm reports now. The id names only the
 * package and range, so an escalated advisory keeps its old record.
 * @param recorded - the severity the record accepted.
 * @param reported - the severity npm reports now.
 * @returns `true` when the record no longer covers the advisory.
 */
function recordedBelow(recorded: AuditSeverity, reported: AuditSeverity): boolean {
  // `unknown` sorts last in SEVERITIES, so a known severity never outranks it. A record of it
  // still covers only itself, since nobody knew what it accepted.
  return (
    SEVERITIES.indexOf(recorded) < SEVERITIES.indexOf(reported) ||
    (recorded === "unknown" && reported !== "unknown")
  )
}

/**
 * @param finding - one blocking finding.
 * @param record - its record, if the registry holds one.
 * @returns why the finding fails, or `undefined` when its record accepts it.
 */
function findingProblem(
  finding: AuditFinding,
  record: SecurityDepsExceptionRecord | undefined,
): string | undefined {
  if (record === undefined) return "no exception record."
  const { verdict, missing } = evaluateFindingVerdict(
    record,
    [{ group: "security-deps", category: finding.severity }],
    SECURITY_DEPS_POLICY,
    FALLBACK_POLICY,
  )
  if (verdict === "forbidden") {
    return "a critical advisory is never waivable; upgrade or remove the package."
  }
  if (verdict === "insufficient") {
    return `the record is incomplete (missing: ${missing.join(", ")}).`
  }
  return recordedBelow(record.severity, finding.severity)
    ? `the record is incomplete: it accepts a ${record.severity} advisory, and npm audit now reports ${finding.severity}. Review it, then set its severity to ${finding.severity}.`
    : undefined
}

const NOTHING_FOUND =
  "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 0 low vulnerabilities were found."

/**
 * Judges the findings against the reconciled registry. A `critical` advisory fails whatever its
 * record says. A lower one passes only with a complete record of the same or a higher severity. A
 * stale record fails. `info` is reported and never blocks.
 * @param findings - this run's findings.
 * @param registry - the registry after reconciliation.
 * @returns the verdict.
 */
export function judgeAuditFindings(
  findings: readonly AuditFinding[],
  registry: PersistedExceptionRegistry<SecurityDepsExceptionRecord>,
): PolicyResult {
  const recordsById = new Map(registry.activeRecords.map((record) => [record.id, record]))
  const blocking = findings.filter((finding) => finding.severity !== "info")
  const problems: string[] = []
  for (const finding of blocking) {
    const detail = findingProblem(finding, recordsById.get(finding.id))
    if (detail !== undefined) problems.push(`- ${finding.id} [${finding.severity}]: ${detail}`)
  }
  for (const record of registry.staleRecords) {
    problems.push(
      `- ${JSON.stringify(record.id)} is stale: npm audit no longer reports it; delete this record.`,
    )
  }

  if (problems.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `${String(problems.length)} npm audit finding(s) or stale record(s) need attention:`,
        ...problems,
      ].join("\n"),
    }
  }

  const info = findings.length - blocking.length
  if (info > 0) {
    const accepted =
      blocking.length > 0
        ? `${String(blocking.length)} npm audit finding(s), each accepted by a complete exception record.`
        : "0 blocking npm audit finding(s) remain."
    return {
      outcome: "warn",
      rationale: `${accepted} ${String(info)} info-severity finding(s) remain and never block.`,
    }
  }
  if (blocking.length === 0) return { outcome: "pass", rationale: NOTHING_FOUND }
  return {
    outcome: "pass",
    rationale: `${String(blocking.length)} npm audit finding(s), each accepted by a complete exception record.`,
  }
}
