// Single source of truth for the repository's coverage thresholds. Imported
// by scripts/report-coverage.mjs (CLI-facing report, not a gate) and
// repo-contract.config.ts's `coverage` check policy (the actual gate), so
// the two can never silently drift apart the way a comment-based
// "intentionally matches vitest.config.ts" convention could.

export const COVERAGE_THRESHOLDS = {
  branches: 85,
  functions: 95,
  lines: 90,
  statements: 90,
}
