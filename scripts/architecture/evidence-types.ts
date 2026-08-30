/**
 * Evidence shape printed to stdout by scripts/check-architecture.mjs (as
 * JSON, for repo-contract.config.ts's `output: { format: "json" }` to
 * parse) and consumed by policy.ts. Two independently-meaningful sections --
 * see specs/verification-taxonomy.md for why they're combined into one
 * command's evidence without being the same question.
 */

interface DependencyGraphViolation {
  readonly from: string
  readonly to: string
  readonly rule: string
  readonly severity: "error" | "warn" | "info"
  readonly comment: string
}

/**
 * `ok: false` means dependency-cruiser itself failed to run or produced
 * unparseable output -- a tool-infrastructure failure, never conflated with
 * "the rules ran and found violations" (mirrors every other check's
 * CheckStatus/ParsedOutput.success distinction).
 */
export type DependencyGraphEvidence =
  | {
      readonly ok: true
      readonly modulesAnalyzed: number
      readonly errorCount: number
      readonly warnCount: number
      readonly infoCount: number
      readonly violations: readonly DependencyGraphViolation[]
    }
  | {
      readonly ok: false
      readonly error: string
    }

/**
 * A file-scanning check's evidence: either it ran (`ok: true`, with the file count and every
 * violation string it found) or the scan itself failed (`ok: false`, a tool-infrastructure failure
 * never conflated with "the scan ran and found violations"). The two scan-style sections of the
 * architecture check -- {@link TestCategoryBoundariesEvidence} and {@link AdrStructureEvidence} --
 * are structurally this same shape; each keeps its own named alias so a consumer's error messages
 * and the JSON schema still read in terms of the specific section.
 */
type ScanEvidence =
  | {
      readonly ok: true
      readonly filesScanned: number
      readonly violations: readonly string[]
    }
  | {
      readonly ok: false
      readonly error: string
    }

export type TestCategoryBoundariesEvidence = ScanEvidence

/**
 * `ok: false` means the scan itself failed (e.g. specs/decisions/ is unreadable) -- a
 * tool-infrastructure failure, never conflated with "the scan ran and found violations." Checks
 * only mechanical shape (filename, duplicate numbers, required headings) -- never whether an ADR's
 * actual reasoning holds up, and never git history (a numbering gap is accepted by design). See
 * specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
 */
export type AdrStructureEvidence = ScanEvidence

export interface ArchitectureEvidence {
  readonly dependencyGraph: DependencyGraphEvidence
  readonly testCategoryBoundaries: TestCategoryBoundariesEvidence
  readonly adrStructure: AdrStructureEvidence
}
