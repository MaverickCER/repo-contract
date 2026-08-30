/**
 * Evidence shape printed to stdout by check.ts (as JSON, for repo-contract.config.ts's
 * `output: { format: "json" }` to parse) and consumed by checks/api-docs.ts's policy. Internal,
 * unpublished tooling contract -- never imported by anything outside scripts/api-docs/ and its
 * tests.
 */

/**
 * One target's (see report-targets.ts) freshly-generated report, compared against what's actually
 * committed under docs/api-report/.
 */
export interface ApiDocsReportEvidence {
  readonly reportFileName: string
  /** Repository-relative path of the committed report this target corresponds to. */
  readonly committedPath: string
  /** `false` means the committed report no longer matches what API Extractor produces from the real, current public surface -- someone changed an export without running `npm run api-docs:generate`. */
  readonly upToDate: boolean
  /** Every `// (undocumented)`/`(No @packageDocumentation comment for this package)` marker API Extractor left in the freshly-generated report, one entry per occurrence. Empty means every symbol in this target carries real TSDoc. */
  readonly undocumentedMarkers: readonly string[]
}

/** The result of regenerating every public entry point's API report and comparing it against what's committed. */
export interface ApiDocsEvidence {
  readonly reports: readonly ApiDocsReportEvidence[]
}
