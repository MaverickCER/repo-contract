import type { CheckDefinitionConfig } from "../types.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

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
// No missing-dependency check here (see shared/missing-dependency.ts's own
// doc comment): this preset shells out to `npm` itself, which cannot be
// "missing" in any environment capable of running `npm run <script>` at
// all -- the exception is intentional, not an oversight.
/** Dependency vulnerability scanning via `npm audit`. */
export const securityDeps: CheckDefinitionConfig = {
  run: ["npm", "audit", "--omit=dev", "--json"],
  output: { format: "json" },
  policy: ({ result }) => {
    const terminated = checkTerminatedAbnormally(result, "npm audit")
    if (terminated) return terminated

    if (!result.output?.success) {
      return { outcome: "fail", rationale: "npm audit output could not be parsed as JSON." }
    }

    const report = result.output.value as NpmAuditReport
    const vulnerabilities = report.metadata?.vulnerabilities

    if (!vulnerabilities) {
      return {
        outcome: "fail",
        rationale: "npm audit produced no vulnerability summary.",
      }
    }

    // Every count is cast from untrusted parsed JSON. A proxy registry, a
    // future npm format, or a truncated report can omit a severity field --
    // `undefined + n` is `NaN`, and both `NaN > 0` and `undefined > 0` are
    // false, which would silently turn real reported vulnerabilities into a
    // "0 of everything" pass. Require every severity count to be a finite
    // number before trusting the summary at all.
    const severities = ["info", "low", "moderate", "high", "critical"] as const
    const missingCount = severities.find((severity) => !Number.isFinite(vulnerabilities[severity]))

    if (missingCount !== undefined) {
      return {
        outcome: "fail",
        rationale: `npm audit's vulnerability summary is missing a numeric "${missingCount}" count -- the report could not be evaluated.`,
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
    // (they were never part of this policy's pass/fail contract), but a pass
    // built on top of some unresolved info-level findings is still worth
    // surfacing explicitly rather than silently folding into an unqualified
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
