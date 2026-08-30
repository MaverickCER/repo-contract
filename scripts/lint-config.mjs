// This repository's own exemptions for the deadCode preset's
// "unused devDependency" category -- CLI tools knip has no way to see are
// used, because nothing `import`s them (see src/presets/dead-code.ts). Kept
// here, imported into repo-contract.config.ts, rather than inlined at the
// call site -- matches this repository's own established precedent for
// repo-specific check configuration (see COVERAGE_THRESHOLDS in
// scripts/coverage-thresholds.mjs).
export const EXEMPT_UNUSED_DEV_DEPENDENCIES = [
  "@arethetypeswrong/cli",
  // Spawned by name by the `commitlint` preset and the .githooks/commit-msg
  // hook -- nothing imports it, so knip can't see it.
  "@commitlint/cli",
  // Resolved via `require.resolve()` (not a static import) in
  // scripts/github-actions/lint.mjs, which knip may not trace.
  "github-actionlint",
  "licensee",
  "linkinator",
  "oxlint",
  "pa11y",
  "publint",
]
