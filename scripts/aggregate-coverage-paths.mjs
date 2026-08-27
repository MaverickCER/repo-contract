// Single source of truth for where the aggregate coverage artifact lives -- imported by
// scripts/aggregate-coverage.mjs (the writer) and checks/crap.ts (a reader, alongside the
// `coverage` check itself), so the two can never silently drift onto two different path literals
// for what must be the same file. See specs/decisions/0006-independent-verification-boundaries-coverage-is-a-union.md.

export const AGGREGATE_COVERAGE_DIR = "coverage/aggregate"
export const AGGREGATE_COVERAGE_FINAL_PATH = `${AGGREGATE_COVERAGE_DIR}/coverage-final.json`
