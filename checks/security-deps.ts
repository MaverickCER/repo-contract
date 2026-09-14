/**
 * Runtime dependency vulnerability scanning via `npm audit` (the `securityDeps` preset's own
 * `run`), gated through the same reviewable, file-based exception-registry model
 * `security-socket.ts` already uses -- never a hardcoded in-source allowlist. `npm audit`'s own
 * raw evidence is read and reported verbatim; an accepted finding is never stripped from it.
 * Acceptance is decided entirely at the policy layer: a finding with no matching, complete
 * exception record fails, regardless of how well-known or long-standing it is.
 *
 * Split the same way `security-socket.ts` is: this file owns only the pure
 * evidence -> `PolicyResult` evaluation (`evaluateSecurityDepsPolicy`, unit-tested directly, no
 * filesystem); loading/reconciling/writing `.repo-contract/exceptions/security-deps.json` and
 * running `npm audit` itself live in `securityDeps()`'s own `policy`, the one place this check
 * touches the filesystem.
 *
 * `--omit=dev` scopes the scan to the dependency graph actually shipped to a consumer's own
 * installers; a finding can still surface here for a package that is transitively required by
 * this repository's own dev tooling when npm's own `--omit` filtering doesn't cleanly separate a
 * hoisted/deduplicated package from every path that reaches it.
 *
 * Every severity requires the full field set (no severity-tiered "forbidden above medium" the
 * way `security-socket.ts` has): a dependency vulnerability, unlike a Socket
 * supply-chain-behavior alert about a package generally free to swap, is very often deep in a
 * required* tooling chain with no real alternative -- the exception system exists precisely to
 * make that judgment call reviewable, not to forbid it outright regardless of severity.
 */
import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  evaluateExceptionRecord,
  loadExceptionRegistry,
  reconcileExceptions,
  validateExceptionPolicyConfig,
  writeExceptionRegistry,
} from "../src/helpers/index.js"
import type {
  ExceptionClassification,
  ExceptionPolicy,
  ExceptionPolicyConfig,
  ExceptionRecordCore,
  StandardSchemaV1,
} from "../src/helpers/index.js"
import {
  EXCEPTION_TYPES,
  SECURITY_EXCEPTION_FIELD_KEYS,
  asFlatExceptionRecords,
  validateExceptionRegistry,
  validateSecurityExceptionFields,
} from "../scripts/shared/exception-record.js"
import type {
  ExceptionRegistrySchema,
  ExceptionMethod,
  ExceptionType,
} from "../scripts/shared/exception-record.js"
import { checkTerminatedAbnormally } from "../src/presets/shared/terminal-status.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

const REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/security-deps.json"

const SEVERITY_VALUES = new Set(["info", "low", "moderate", "high", "critical"])
export type Severity = "info" | "low" | "moderate" | "high" | "critical" | "unknown"

interface NpmAuditVulnerability {
  readonly severity?: string
  readonly range?: string
}
interface NpmAuditReport {
  readonly vulnerabilities?: Record<string, NpmAuditVulnerability>
}

/** One normalized `npm audit` finding -- one per vulnerable top-level package name, exactly as npm audit's own report already groups them (a single entry can cover several distinct advisories at once). */
export interface NormalizedDepFinding {
  readonly id: string
  readonly package: string
  readonly range: string
  readonly severity: Severity
}

/** One `.repo-contract/exceptions/security-deps.json` record: the shared security-family fields plus this registry's own identity fields. */
export interface SecurityDepsExceptionRecord {
  readonly id: string
  readonly version: 1
  readonly justification: string
  readonly alternatives: string
  readonly remediation: string
  readonly method: "" | ExceptionMethod
  readonly exceptionType: "" | ExceptionType
  readonly package: string
  readonly range: string
  readonly severity: Severity
}

/**
 * `security-deps:<package>@<range>` -- stable while the same vulnerable range is reported; a version bump or a new/different advisory changes `range` and the id with it, so a stale record is never silently reused for an unrelated finding.
 * @param finding - The finding's (or record's) identity fields.
 * @param finding.package - The npm package name.
 * @param finding.range - `npm audit`'s own reported vulnerable version range for this package.
 * @returns The semantic id.
 */
export function deriveSecurityDepsExceptionId(finding: {
  readonly package: string
  readonly range: string
}): string {
  return `security-deps:${finding.package}@${finding.range}`
}

/**
 * A fresh, blank exception record for a finding with no matching record yet.
 * @param finding - The unmatched finding.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createSecurityDepsStub(
  finding: NormalizedDepFinding,
  id: string,
): SecurityDepsExceptionRecord {
  return {
    id,
    version: 1,
    justification: "",
    alternatives: "",
    remediation: "",
    method: "",
    exceptionType: "",
    package: finding.package,
    range: finding.range,
    severity: finding.severity,
  }
}

/**
 * `value` is a non-empty string -- pushes a `"<at> must be a non-empty string."` message onto `errors` otherwise.
 * @param value - The candidate value.
 * @param at - The field's own dotted path, for the error message.
 * @param errors - Accumulates every validation problem found.
 * @returns `true` if `value` is a non-empty string.
 */
function isValidNonEmptyStringField(value: unknown, at: string, errors: string[]): value is string {
  const valid = typeof value === "string" && value.length > 0
  if (!valid) errors.push(`${at} must be a non-empty string.`)
  return valid
}

export const SECURITY_DEPS_EXCEPTION_SCHEMA: ExceptionRegistrySchema<SecurityDepsExceptionRecord> =
  {
    namespace: "security-deps:",
    metadataKeys: [...SECURITY_EXCEPTION_FIELD_KEYS, "package", "range", "severity"],
    validateRecord(core: ExceptionRecordCore, raw, index, errors) {
      const at = `exceptions[${String(index)}]`
      const security = validateSecurityExceptionFields(raw, index, EXCEPTION_TYPES, errors)

      const { package: pkg, range, severity } = raw
      const pkgValid = isValidNonEmptyStringField(pkg, `${at}.package`, errors)
      const rangeValid = isValidNonEmptyStringField(range, `${at}.range`, errors)
      const severityValid =
        typeof severity === "string" && (SEVERITY_VALUES.has(severity) || severity === "unknown")
      if (!severityValid) {
        errors.push(
          `${at}.severity must be one of "info", "low", "moderate", "high", "critical", "unknown" (got ${JSON.stringify(severity)}).`,
        )
      }

      if (security === undefined || !pkgValid || !rangeValid || !severityValid) return undefined

      const identity = { package: pkg, range }
      const derived = deriveSecurityDepsExceptionId(identity)
      if (derived !== core.id) {
        errors.push(
          `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own package/range (${JSON.stringify(derived)}).`,
        )
        return undefined
      }

      return {
        id: core.id,
        version: 1,
        justification: core.justification,
        ...security,
        ...identity,
        severity: severity as Severity,
      }
    },
  }

/** Every severity requires the full field set -- see this module's own doc comment for why there is no severity-tiered "forbidden" the way `security-socket.ts` has. */
const REQUIREMENTS = ["justification", "alternatives", "remediation", "method", "exceptionType"]
const SECURITY_DEPS_POLICY: ExceptionPolicyConfig = {
  "security-deps": { default: { mode: "exception", requirements: [...REQUIREMENTS] } },
}
const SECURITY_DEPS_GLOBAL_DEFAULT_POLICY: ExceptionPolicy = {
  mode: "exception",
  requirements: [...REQUIREMENTS],
}
const VALID_SECURITY_DEPS_REQUIREMENTS = [
  "justification",
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
] as const

/**
 * Reads one required field's current string value straight off a reconciled record.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
function securityDepsFieldValue(record: SecurityDepsExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Evaluates one finding against `SECURITY_DEPS_POLICY`, classified purely on its severity.
 * @param finding - The finding.
 * @param record - The reconciled live record for it, or `undefined` if the bijection broke.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateFinding(
  finding: NormalizedDepFinding,
  record: SecurityDepsExceptionRecord | undefined,
): {
  readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"
  readonly missing: readonly string[]
} {
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "security-deps", category: finding.severity },
  ]
  const determinant = evaluateExceptionRecord({
    record,
    classifications,
    config: SECURITY_DEPS_POLICY,
    globalDefault: SECURITY_DEPS_GLOBAL_DEFAULT_POLICY,
    fieldValue: securityDepsFieldValue,
  })
  return { verdict: determinant.verdict, missing: determinant.missing }
}

/** Everything `evaluateSecurityDepsPolicy` needs -- already reconciled/persisted by `securityDeps()`'s own `policy`, its one filesystem-touching step. */
export interface SecurityDepsEvidence {
  readonly findings: readonly NormalizedDepFinding[]
  readonly activeExceptions: Readonly<Record<string, SecurityDepsExceptionRecord>>
  readonly staleExceptions: readonly SecurityDepsExceptionRecord[]
  readonly scaffoldedIds: readonly string[]
}

/**
 * The pure evidence -> `PolicyResult` evaluator -- no filesystem, no `npm audit` invocation,
 * exhaustively unit-testable directly. Mirrors `evaluateSecuritySocketPolicy`'s own split for the
 * identical reason.
 * @param input - Wraps the evidence to evaluate.
 * @param input.evidence - The `SecurityDepsEvidence` `securityDeps()`'s own `policy` assembled.
 * @returns The check's `PolicyResult`.
 */
export function evaluateSecurityDepsPolicy(input: {
  readonly evidence: SecurityDepsEvidence
}): PolicyResult {
  const { evidence } = input

  const configErrors = validateExceptionPolicyConfig(
    SECURITY_DEPS_POLICY,
    VALID_SECURITY_DEPS_REQUIREMENTS,
  )
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "SECURITY_DEPS_POLICY is misconfigured:",
        ...configErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale exception in ${REGISTRY_RELATIVE_PATH}: ${JSON.stringify(record.id)} -- npm audit no longer reports this vulnerability; delete this entry.`,
  )
  const determinants = evidence.findings.map((finding) => ({
    finding,
    ...evaluateFinding(finding, evidence.activeExceptions[finding.id]),
  }))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")

  if (offenders.length === 0 && staleLines.length === 0) {
    const suffix =
      evidence.scaffoldedIds.length > 0
        ? ` (${String(evidence.scaffoldedIds.length)} new record(s) scaffolded blank in ${REGISTRY_RELATIVE_PATH})`
        : ""
    return {
      outcome: "pass",
      rationale: `${String(evidence.findings.length)} npm audit finding(s) evaluated: all permitted by a complete exception record.${suffix}`,
    }
  }

  const offenderLines = offenders.map((d) => {
    const detail =
      d.verdict === "unmatched"
        ? "no reconciled exception record (registry integrity failure)"
        : `exception incomplete (missing: ${d.missing.join(", ")})`
    return `- ${d.finding.id} [${d.finding.severity}]: ${detail}`
  })

  return {
    outcome: "fail",
    rationale: [
      `${String(offenders.length + evidence.staleExceptions.length)} npm audit finding(s) or stale record(s) need attention:`,
      ...offenderLines,
      ...staleLines,
    ].join("\n"),
  }
}

const registrySchema: StandardSchemaV1<unknown, readonly SecurityDepsExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const result = validateExceptionRegistry(value, SECURITY_DEPS_EXCEPTION_SCHEMA)
      return result.ok
        ? { value: result.records }
        : { issues: result.errors.map((message) => ({ message })) }
    },
  },
}

/**
 * Normalizes `npm audit --json`'s own `vulnerabilities` object into one finding per package.
 * @param report - The parsed `npm audit --json` report.
 * @returns One normalized finding per vulnerable package.
 */
function normalizeFindings(report: NpmAuditReport): readonly NormalizedDepFinding[] {
  return Object.entries(report.vulnerabilities ?? {}).map(([name, vulnerability]) => {
    const severityRaw = vulnerability.severity
    const severity: Severity =
      typeof severityRaw === "string" && SEVERITY_VALUES.has(severityRaw)
        ? (severityRaw as Severity)
        : "unknown"
    const range =
      typeof vulnerability.range === "string" && vulnerability.range.length > 0
        ? vulnerability.range
        : "unknown"
    return {
      id: deriveSecurityDepsExceptionId({ package: name, range }),
      package: name,
      range,
      severity,
    }
  })
}

/** @returns the `SecurityDeps` check. */
export function securityDeps(): CheckDefinitionConfig {
  return {
    run: ["npm", "audit", "--omit=dev", "--json"],
    output: { format: "json" },
    policy: async ({ result }): Promise<PolicyResult> => {
      const terminated = checkTerminatedAbnormally(result, "npm audit")
      if (terminated) return terminated

      // `npm audit` exits non-zero the moment it finds anything; `output.success` reflects only
      // whether stdout parsed as JSON, independent of that exit code.
      if (!result.output?.success) {
        return { outcome: "fail", rationale: "npm audit output could not be parsed as JSON." }
      }
      const parsed: unknown = result.output.value
      if (typeof parsed !== "object" || parsed === null) {
        return { outcome: "fail", rationale: "npm audit produced invalid JSON report data." }
      }

      const findings = normalizeFindings(parsed)

      const registryPath = path.join(process.cwd(), REGISTRY_RELATIVE_PATH)
      const loaded = await loadExceptionRegistry({ path: registryPath, schema: registrySchema })
      if (!loaded.ok) {
        return {
          outcome: "fail",
          rationale: [
            `${REGISTRY_RELATIVE_PATH} failed to load and was left unchanged:`,
            ...loaded.errors.map((e) => `- ${e}`),
          ].join("\n"),
        }
      }

      const reconciled = reconcileExceptions<NormalizedDepFinding, SecurityDepsExceptionRecord>({
        existing: loaded.records,
        findings,
        deriveId: (finding) => finding.id,
        createStub: createSecurityDepsStub,
      })
      if (!reconciled.ok) {
        return {
          outcome: "fail",
          rationale: `${REGISTRY_RELATIVE_PATH} could not be reconciled: ${reconciled.error}`,
        }
      }
      const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

      try {
        await mkdir(path.dirname(registryPath), { recursive: true })
        const write = await writeExceptionRegistry({
          path: registryPath,
          records: asFlatExceptionRecords([...activeRecords, ...staleRecords]),
        })
        if (!write.ok) {
          return {
            outcome: "fail",
            rationale: `Writing ${REGISTRY_RELATIVE_PATH} failed: ${write.error}`,
          }
        }
      } catch (error) {
        return {
          outcome: "fail",
          rationale: `Could not write ${REGISTRY_RELATIVE_PATH}: ${(error as Error).message}`,
        }
      }

      const activeExceptions: Record<string, SecurityDepsExceptionRecord> = {}
      for (const record of activeRecords) activeExceptions[record.id] = record

      return evaluateSecurityDepsPolicy({
        evidence: {
          findings,
          activeExceptions,
          staleExceptions: staleRecords,
          scaffoldedIds: newStubIds,
        },
      })
    },
  }
}
