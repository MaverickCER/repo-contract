// Highlighting thresholds only -- never a gate (see internal-package-contract's
// scripts/benchmark/render-summary.mjs, which reads this file's BUDGETS export to annotate, never
// fail, its PR-comment table). One shared file across all three categories, mirroring env-cap's/
// data-cap's own single benchmark-fixtures/budgets.mjs.

export const BUDGETS = {
  "run-checks": { maxRegressionPercent: 15 },
  "evaluate-evidence-and-policy": { maxRegressionPercent: 15 },
  "diff-api-contract": { maxRegressionPercent: 20 },
}
