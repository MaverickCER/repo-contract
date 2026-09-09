/**
 * Stands in for `npm audit --json`, parsed into a flat list of advisories. Hard-coded so the
 * walkthrough is deterministic and needs neither network access nor real vulnerable packages
 * installed. In a real check this list would come from parsing the audit report's `vulnerabilities`
 * map in the check's `policy` (`output: { format: "json" }`).
 */
export interface DependencyAdvisory {
  readonly package: string
  readonly advisoryId: string
  readonly severity: "low" | "moderate" | "high" | "critical"
  readonly title: string
  readonly vulnerableRange: string
}

export const advisories: readonly DependencyAdvisory[] = [
  {
    package: "tough-cookie",
    advisoryId: "GHSA-72xf-g2v4-qvf3",
    severity: "moderate",
    title: "Prototype pollution in tough-cookie",
    vulnerableRange: "<4.1.3",
  },
  {
    package: "semver",
    advisoryId: "GHSA-c2qf-rxjj-qqgw",
    severity: "moderate",
    title: "Regular expression denial of service in semver",
    vulnerableRange: "<7.5.2",
  },
  {
    package: "minimist",
    advisoryId: "GHSA-xvch-5gmm-9grj",
    severity: "high",
    title: "Prototype pollution in minimist",
    vulnerableRange: "<1.2.6",
  },
]

/**
 * The canonical identity of one advisory -- how a finding is matched to a waiver record, and back.
 * `repo-contract/helpers` deliberately has no opinion about what this looks like; it is entirely
 * yours. Here, package name plus GHSA id is stable across audit runs and unique per advisory.
 * @param finding - The advisory to identify.
 * @returns A stable string id.
 */
export function deriveAdvisoryId(finding: DependencyAdvisory): string {
  return `${finding.package}:${finding.advisoryId}`
}
