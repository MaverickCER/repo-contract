/**
 * Evidence shape printed to stdout by scripts/check-architecture.mjs (as
 * JSON, for repo-contract.config.ts's `output: { format: "json" }` to
 * parse) and consumed by policy.ts. Two independently-meaningful sections:
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
 * unparseable output. Such a tool-infrastructure failure is never conflated
 * with "the rules ran and found violations". This mirrors every other check's
 * CheckStatus/ParsedOutput.success distinction.
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
 * A file-scanning check's evidence. Either it ran (`ok: true`, with the file count and every
 * violation string it found) or the scan itself failed (`ok: false`). A failed scan is a
 * tool-infrastructure failure, never conflated with "the scan ran and found violations". The
 * architecture check has two scan-style sections: {@link TestCategoryBoundariesEvidence} and
 * {@link AdrStructureEvidence}. Both are structurally this same shape. Each keeps its own named
 * alias so a consumer's error messages and the JSON schema still name the specific section.
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
 * `ok: false` means the scan itself failed, e.g. because specs/decisions/ is unreadable. Such a
 * tool-infrastructure failure is never conflated with "the scan ran and found violations". The
 * scan checks only mechanical shape: filename, duplicate numbers, required headings. It never
 * judges whether an ADR's actual reasoning holds up. It never reads git history either, so a
 * numbering gap is accepted by design. See
 * specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
 */
export type AdrStructureEvidence = ScanEvidence

export interface ArchitectureEvidence {
  readonly dependencyGraph: DependencyGraphEvidence
  readonly testCategoryBoundaries: TestCategoryBoundariesEvidence
  readonly adrStructure: AdrStructureEvidence
}
