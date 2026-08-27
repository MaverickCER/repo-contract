// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  reporters: ["json", "progress", "clear-text"],
  // "perTest" ran into coverage-attribution quirks (a mutant on a line every
  // throwing-policy test genuinely exercises was reported as only covered by
  // unrelated tests) during implementation -- "all" re-runs the whole suite
  // per mutant instead of a filtered subset, trading a small amount of speed
  // (this suite runs in well under a second) for not depending on that
  // attribution being exactly right.
  coverageAnalysis: "all",
  mutate: [
    "src/**/*.ts",
    // Type-only, no runtime behavior to mutate meaningfully -- see
    // vitest.config.ts's coverage.exclude for the same rationale.
    "!src/types.ts",
  ],
  // Lets a manually-invoked `npx stryker run` skip re-testing mutants it
  // believes are unaffected by a source change, reusing their previous
  // status from `incrementalFile` -- useful for a developer iterating
  // locally. repo-contract's own `mutation` check never benefits from this:
  // scripts/run-mutation.mjs deletes `incrementalFile` before every run it
  // triggers, so the check's own evidence always reflects a full, fresh
  // analysis rather than a possibly-stale reused mutant status (see that
  // script's own comment for why).
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 20_000,
}

export default config
