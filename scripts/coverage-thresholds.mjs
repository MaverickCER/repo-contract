// Single source of truth for the repository's coverage thresholds. Two places
// import it: scripts/report-coverage.mjs (a CLI-facing report, not a gate)
// and the `coverage` check policy in repo-contract.config.ts (the gate). One
// import keeps the two in step. A comment saying "matches vitest.config.ts"
// could drift unnoticed.

export const COVERAGE_THRESHOLDS = {
  branches: 85,
  functions: 95,
  lines: 90,
  statements: 90,
}
