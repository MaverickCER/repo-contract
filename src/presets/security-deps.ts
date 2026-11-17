import { exceptionRegistryStandardSchema } from "../helpers/exception-record.js"
import { loadAndReconcileExceptionRegistry } from "../helpers/persist-exception-registry.js"
import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import {
  auditReportProblem,
  createSecurityDepsStub,
  judgeAuditFindings,
  normalizeAuditFindings,
  SECURITY_DEPS_EXCEPTION_SCHEMA,
} from "./rules/security-deps-registry.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

interface NpmAuditVulnerabilityCounts {
  readonly info: number
  readonly low: number
  readonly moderate: number
  readonly high: number
  readonly critical: number
}

interface NpmAuditAdvisory {
  readonly severity?: string
  readonly range?: string
  readonly isDirect?: boolean
  readonly via?: readonly unknown[]
  readonly fixAvailable?:
    | boolean
    | {
        readonly name?: string
        readonly version?: string
        readonly isSemVerMajor?: boolean
      }
}

interface NpmAuditReport {
  readonly auditReportVersion?: number
  readonly vulnerabilities?: Record<string, NpmAuditAdvisory>
  readonly metadata?: {
    readonly vulnerabilities?: NpmAuditVulnerabilityCounts
  }
}

// --omit=dev evaluates only the dependency graph shipped to consumers.
// Development dependency vulnerabilities remain evidence but do not block
// this runtime security contract. The blocking threshold is repository
// policy rather than an opinion imposed by repo-contract.
//
// No missing-dependency check here (see shared/missing-dependency.ts's
// doc comment). This preset shells out to `npm` itself, which cannot be
// "missing" in any environment capable of running `npm run <script>` at
// all. The exception is intentional, not an oversight.
/** Options accepted by {@link securityDeps}. */
export interface SecurityDepsOptions {
  /**
   * The exception registry, such as `".repo-contract/exceptions/security-deps.json"`. With one, a
   * `critical` advisory still fails, and a lower one passes only while a complete record accepts
   * it. The check writes a blank record for each new advisory and fails on a record whose advisory
   * is gone. An `info` finding warns and gets no record. Defaults to `false`: no registry,
   * so any low, moderate, high or critical advisory fails.
   */
  readonly registry?: string | false
}

/**
 * Dependency vulnerability scanning via `npm audit`.
 * @param options - configuration for this check; see {@link SecurityDepsOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export function securityDeps(options: SecurityDepsOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("securityDeps", options)
  const { registry = false } = options
  if (registry !== false) return securityDepsWithRegistry(registry)
  return {
    run: ["npm", "audit", "--omit=dev", "--json"],
    output: { format: "json" },
    policy: ({ result }) => {
      const terminated = checkTerminatedAbnormally(result, "npm audit")
      if (terminated) return terminated

      if (!result.output?.success) {
        return { outcome: "fail", rationale: "npm audit output could not be parsed as JSON." }
      }

      // `output.success` only means `JSON.parse` didn't throw: valid JSON of an
      // unexpected shape (`null`, a primitive) must fail cleanly, not throw
      // `.metadata` out of the policy.
      const value: unknown = result.output.value
      if (typeof value !== "object" || value === null) {
        return { outcome: "fail", rationale: "npm audit produced invalid JSON report data." }
      }

      const report = value as NpmAuditReport
      const vulnerabilities = report.metadata?.vulnerabilities

      if (!vulnerabilities) {
        return {
          outcome: "fail",
          rationale: "npm audit produced no vulnerability summary.",
        }
      }

      // Every count is cast from untrusted parsed JSON. A proxy registry, a
      // future npm format, or a truncated report can omit a severity field.
      // `undefined + n` is `NaN`, and both `NaN > 0` and `undefined > 0` are
      // false. That would silently turn reported vulnerabilities into a
      // "0 of everything" pass. Require every severity count to be a finite
      // number before trusting the summary at all.
      const severities = ["info", "low", "moderate", "high", "critical"] as const
      const missingCount = severities.find(
        (severity) => !Number.isFinite(vulnerabilities[severity]),
      )

      if (missingCount !== undefined) {
        return {
          outcome: "fail",
          rationale: `npm audit's vulnerability summary is missing a numeric "${missingCount}" count, so the report could not be evaluated.`,
        }
      }

      const blocking =
        vulnerabilities.low +
        vulnerabilities.moderate +
        vulnerabilities.high +
        vulnerabilities.critical

      if (blocking > 0) {
        const details = Object.entries(report.vulnerabilities ?? {})
          .map(([name, vulnerability]: [string, NpmAuditAdvisory]) => {
            const severity = vulnerability.severity ?? "unknown"

            const dependencyType = vulnerability.isDirect === true ? "direct" : "transitive"

            const range = vulnerability.range ? ` range=${vulnerability.range}` : ""

            const fix =
              vulnerability.fixAvailable === true
                ? " fix available"
                : vulnerability.fixAvailable
                  ? " remediation available"
                  : " no automatic fix available"

            return `${name}: ${severity} (${dependencyType})${range};${fix}`
          })
          .sort()

        return {
          outcome: "fail",
          rationale: [
            `npm audit found ${String(blocking)} runtime vulnerability(ies):`,
            ...details.map((detail: string) => `- ${detail}`),
          ].join("\n"),
        }
      }

      // `info`-severity findings are excluded from the blocking count above
      // (they were never part of this policy's pass/fail contract). But a pass
      // built on top of unresolved info-level findings is still worth
      // surfacing explicitly, rather than silently folding into an unqualified
      // pass.
      if (vulnerabilities.info > 0) {
        return {
          outcome: "warn",
          rationale: `Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 0 low vulnerabilities were found. ${String(vulnerabilities.info)} info-severity finding(s) remain and are non-blocking under repository policy.`,
        }
      }

      return {
        outcome: "pass",
        rationale:
          "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 0 low vulnerabilities were found.",
      }
    },
  }
}

const REGISTRY_SCHEMA = exceptionRegistryStandardSchema(SECURITY_DEPS_EXCEPTION_SCHEMA)

/**
 * @param registry - the registry path, relative to the working directory or absolute.
 * @returns the check that judges advisories against the registry and writes it back.
 */
function securityDepsWithRegistry(registry: string): CheckDefinitionConfig {
  return {
    run: ["npm", "audit", "--omit=dev", "--json"],
    output: { format: "json" },
    policy: async ({ result }): Promise<PolicyResult> => {
      const terminated = checkTerminatedAbnormally(result, "npm audit")
      if (terminated) return terminated
      // npm audit exits non-zero whenever it finds anything, so only the parse result matters here.
      if (!result.output?.success) {
        return { outcome: "fail", rationale: "npm audit output could not be parsed as JSON." }
      }
      const report: unknown = result.output.value
      const problem = auditReportProblem(report)
      if (problem !== undefined) return { outcome: "fail", rationale: problem }

      const findings = normalizeAuditFindings(report)
      // An info finding never blocks, so it gets no record to fill in.
      const blocking = findings.filter((finding) => finding.severity !== "info")
      const persisted = await loadAndReconcileExceptionRegistry(
        registry,
        registry,
        REGISTRY_SCHEMA,
        blocking,
        createSecurityDepsStub,
      )
      if (!persisted.ok) return { outcome: "fail", rationale: persisted.rationale }
      return judgeAuditFindings(findings, persisted.registry)
    },
  }
}
