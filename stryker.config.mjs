// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  reporters: ["json", "progress", "clear-text"],
  // "perTest": each mutant runs only the tests that cover it, read from Stryker's per-test
  // coverage hooks. "all" (the whole suite per mutant) was tried first and is not viable: a full
  // run takes about 16s, and 2000+ mutants makes that hours. If "perTest" credits a mutant to too
  // few tests, the mutant shows as Survived, and the `mutation` check fails on that.
  coverageAnalysis: "perTest",
  // Static mutants are evaluated once at module load, not per test. Under "perTest" no covering
  // test can be named for one, so Stryker would run the entire suite for each. That was the
  // largest share of this run's wall time by far: Stryker's planner warned that ~145 of them
  // took ~63% of the estimated total. Ignoring them gives up mutating load-time constants.
  // checks/mutation.ts accepts the resulting `Static mutant (and "ignoreStatic" was enabled)`
  // Ignored status as its own config-level exemption. A comment-ignored mutant is a different
  // case, and still goes through the suppression-registry gate.
  ignoreStatic: true,
  mutate: [
    "src/**/*.ts",
    // Type-only, no runtime behavior to mutate meaningfully: see
    // vitest.config.ts's coverage.exclude for the same rationale.
    "!src/types.ts",
    // The process, signal and scheduling core is not mutation-tested in-process. A mutant here
    // makes the *Stryker test runner itself* unstable, not merely a test fail:
    // - process-tree.ts's `killTree` signals real process groups. A mutated pid guard turns
    //   `killTree(0)` into `process.kill(-0, ...)`, which kills the worker's own group, and
    //   the run ends with no report.
    // - run-checks.ts installs real SIGINT/SIGTERM handlers and spawns real process trees.
    // - spawn-check.ts spawns real child processes.
    // - dependency-scheduler.ts mutants defeat its stall guard and hang the worker until the
    //   test timeout.
    // The `integration` and `e2e` categories verify these paths against real processes instead.
    // specs/verification-taxonomy.md treats mutation as one signal among several.
    "!src/execution/process-tree.ts",
    "!src/execution/run-checks.ts",
    "!src/execution/spawn-check.ts",
    "!src/execution/dependency-scheduler.ts",
    // The affected analysis spreads a change through the import graph with a queue. The queue
    // refuses a fact it already holds at an equal or smaller distance. Only that rule stops the
    // spread through an import cycle. A mutant that loosens it turns every cyclic import into an
    // endless loop, which a test runner can only report as a timeout. dependency-scheduler.ts is
    // left out for the same reason. The file is a dozen lines, and
    // test/unit/affected/worklist.test.ts exercises the rule directly, cycles included. Tried on
    // 2026-11-10: of 16 mutants, 9 are killed and 1 is equivalent. The 6 that loosen the rule
    // time out in the compute-affected suites, and no test can turn a hang into a failure.
    "!src/affected/worklist.ts",
    // The preset catalog (`repo-contract/presets`) is a separate opt-in entry point; see
    // specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md. Most of it
    // is thin glue: a `run` command plus a policy that calls the helpers in src/presets/shared/.
    // Those helpers have their own unit tests. Every preset's policy branches are unit-tested in
    // test/unit/presets/**. This repository's own contract runs each preset against its real tool.
    // Mutating the per-preset wiring on top of that finds only near-equivalent mutants. They sit
    // in identical shared-helper call sites, repeated ~20 times. Finding no defects, they would
    // still need suppression bookkeeping.
    "!src/presets/**",
    // aiReview is the exception: its parser and policy are real logic (three parse steps, shape
    // checks, a confidence threshold, credential redaction), not a command plus a shared helper.
    "src/presets/ai-review.ts",
    // bundledDependencies and quickStart are exceptions for the same reason. Each policy reads a
    // report and decides pass or fail on several branches of its own.
    "src/presets/bundled-dependencies.ts",
    "src/presets/quick-start.ts",
    // sbom is one too: its policy validates the generator's report and decides on write mode, all
    // documents current, or a listed failure. The generator itself is a string run by `node -e`,
    // so Stryker cannot mutate it; test/unit/presets/sbom.test.ts runs it end to end instead.
    "src/presets/sbom.ts",
    // The redesign keeps each new preset decision in src/presets/rules/. So the logic is mutated
    // while the per-preset wiring stays excluded. coverage, crap, mutation and npmScript read a
    // report and decide on several branches, like quickStart. Their files are mutated too.
    "src/presets/rules/**/*.ts",
    "src/presets/coverage.ts",
    "src/presets/crap.ts",
    "src/presets/mutation.ts",
    "src/presets/npm-script.ts",
    // These bin/ files hold the commands and init's templates, so they are mutated like src/. Each
    // exports its parsing and decisions, and test/unit/bin/ calls them in-process.
    // bin/repo-contract.mjs is left out. It routes each command to its module. It also builds the
    // capabilities that start git, npm, Stryker and shells, and that copy the environment. The
    // integration and e2e suites test it by running it as a real process. cache-cli,
    // merge-mutation-cli, metrics-cli, package-json-patch and quick-start-cli are not mutated yet.
    "bin/init-cli.mjs",
    "bin/mutation-cli.mjs",
    "bin/mutation-plan.mjs",
    "bin/mutation-adopt.mjs",
    "bin/mutation-cache.mjs",
    "bin/affected-cli.mjs",
    "bin/doctor-cli.mjs",
    "bin/except-cli.mjs",
    "bin/exceptions-cli.mjs",
    "bin/explain-cli.mjs",
    "bin/npm-script-cli.mjs",
    "bin/cli-options.mjs",
    "bin/stryker-vitest5-compat.mjs",
    "bin/templates.mjs",
    "bin/preset-catalog.mjs",
  ],
  // Lets a hand-run `npx stryker run` skip mutants it believes a change left alone, reusing
  // their status from `incrementalFile`. The `mutation` check never reuses it:
  // `repo-contract mutation run` deletes `incrementalFile` and passes `--force` every time,
  // because a reused status can be stale (bin/mutation-cli.mjs).
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 20_000,
  // The initial (un-mutated) test run re-runs the whole suite once with per-test coverage hooks.
  // It normally finishes in well under a minute. On a loaded machine or a contended CI runner,
  // that pass can outlast Stryker's 5-minute default. The run then aborts before testing a single
  // mutant. 10 minutes is slack against that contention without masking a genuine hang.
  dryRunTimeoutMinutes: 10,
}

export default config
