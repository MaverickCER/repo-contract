// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  reporters: ["json", "progress", "clear-text"],
  // "perTest": each mutant runs only the tests that actually cover it, read
  // from Stryker's own per-test coverage hooks. "all" (re-run the whole
  // suite per mutant) was tried first and is simply not viable here -- the
  // suite's process-spawning and signal-delivering tests take ~16s per full
  // run, and 2000+ mutants makes that hours, not the "well under a second"
  // an earlier revision of this comment assumed. "perTest" keeps the run in
  // CI-viable territory; the coverage-attribution edge cases it can hit
  // (a mutant credited to fewer tests than really exercise it) surface as a
  // Survived mutant, which checks/mutation.ts already fails on -- so a real
  // misattribution is caught here, not silently trusted.
  coverageAnalysis: "perTest",
  // Static mutants (evaluated once at module load, not per test) cannot be
  // attributed to a covering test under "perTest", so Stryker would fall
  // back to running the entire suite for each one -- the single largest
  // contributor to this run's wall time by far (Stryker's own planner warns
  // ~145 of them account for ~63% of the estimated total). Ignoring them
  // trades that cost for not mutation-testing load-time-constant
  // expressions; checks/mutation.ts accepts the resulting
  // `Static mutant (and "ignoreStatic" was enabled)` Ignored status as a
  // distinct, config-level exemption (never conflated with a
  // comment-ignored mutant, which still goes through the suppression-registry
  // gate).
  ignoreStatic: true,
  mutate: [
    "src/**/*.ts",
    // Type-only, no runtime behavior to mutate meaningfully -- see
    // vitest.config.ts's coverage.exclude for the same rationale.
    "!src/types.ts",
    // The process/signal/scheduling core is deliberately not mutation-tested
    // in-process. A mutant in any of these makes the *Stryker test runner
    // itself* unstable rather than merely failing a test: process-tree.ts's
    // `killTree` delivers real OS signals to real process groups (a mutated
    // pid guard turns `killTree(0)` into `process.kill(-0, ...)`, signalling
    // the Stryker worker's own group and taking the run down with no
    // report); run-checks.ts installs real SIGINT/SIGTERM handlers and
    // spawns real process trees; spawn-check.ts spawns real child processes;
    // dependency-scheduler.ts mutants defeat its stall guard and hang the
    // worker to the test timeout. These paths are verified against real
    // processes by the `integration` and `e2e` categories instead (see
    // specs/verification-taxonomy.md -- mutation is one signal among
    // several, not the only evidence for this code).
    "!src/execution/process-tree.ts",
    "!src/execution/run-checks.ts",
    "!src/execution/spawn-check.ts",
    "!src/execution/dependency-scheduler.ts",
    // The preset catalog (`repo-contract/presets`, a separate opt-in entry
    // point -- see specs/decisions/0005-public-surface-stays-narrow-no-cli-experimental-presets.md)
    // is thin adapter glue: a `run` command plus a policy that dispatches to
    // the shared helpers in src/presets/shared/. Those helpers carry their
    // own dedicated unit tests, every preset's policy branches are unit-
    // tested (test/unit/presets/**), and each preset is exercised for real
    // against its actual tool by this repository's own contract. Mutation-
    // testing the per-preset re-wiring on top of that surfaces only
    // near-equivalent mutants in identical shared-helper call sites,
    // repeated ~20 times, with no defect-finding value proportional to the
    // suppression bookkeeping it would require.
    "!src/presets/**",
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
  // The initial (un-mutated) test run normally finishes in well under a
  // minute, but it re-runs the whole suite once with per-test coverage
  // hooks -- on a heavily loaded machine (a developer running this
  // alongside everything else, or a contended CI runner) that one pass can
  // stretch far past Stryker's 5-minute default and abort the entire run
  // before a single mutant is tested. 10 minutes is slack against that
  // contention without masking a genuine hang.
  dryRunTimeoutMinutes: 10,
}

export default config
