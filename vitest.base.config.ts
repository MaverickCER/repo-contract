import os from "node:os"
import { defineConfig } from "vitest/config"

// Shared across every category-specific config (vitest.unit.config.ts,
// vitest.integration.config.ts, vitest.property.config.ts, vitest.e2e.config.ts)
// and the dev-convenience aggregate (vitest.config.ts) -- avoids duplicating
// settings that don't vary by category. Each category config still declares
// its own `include`/`coverage.reportsDirectory` explicitly, so the execution
// boundary stays visible in that file rather than hidden here.
//
// `maxWorkers` (Vitest 4's replacement for `poolOptions.forks.maxForks`) is
// capped at half the machine's own core count (minimum 2, so a 1-2 core
// machine still gets some parallelism) rather than left at Vitest's own
// default (one worker per core): each of
// these four test categories is itself one of repo-contract's own
// concurrently-scheduled checks (`repo-contract.config.ts` has no
// `dependsOn`/`isolated` between test-unit/test-integration/test-property/
// test-e2e), and repo-contract's own check-level concurrency independently
// defaults to that same core count (`os.availableParallelism()`, see
// `runRepoContract`). Left uncapped, a single `npm run contract` invocation
// double-spends the same CPU budget -- this repository's own dogfooding
// runs (`npm run contract` against this very package) hit a real, repeatable
// failure from it: several test/unit/api-contract/ and test/unit/api-docs/
// files each run a real `@microsoft/api-extractor` analysis against this
// package's own dist/.dts/ output, and enough of those landed in concurrent
// forks at once, alongside this same repository's other CPU-heavy checks
// (`accessibility` launching a real headless Chromium, `arethetypeswrong`,
// `dead-code`, `duplication`, ...) also running concurrently at the
// check level, to intermittently make API Extractor's own SourceMapper
// report a real, on-disk .d.ts path as unreadable under that contention --
// confirmed by rerunning the exact same test files in isolation immediately
// afterward, every time, with zero failures. Halving this category's own
// fork budget leaves headroom for the other concurrently-scheduled checks
// instead of both layers independently assuming the whole machine is
// theirs.
const maxWorkers = Math.max(2, Math.floor(os.availableParallelism() / 2))

export default defineConfig({
  test: {
    environment: "node",
    watch: false,
    // The process-spawning tests need real process isolation, not worker
    // threads -- `forks` is Vitest's default but pin it so a future default
    // flip can't silently change the isolation model these tests rely on.
    pool: "forks",
    // Process-spawning tests (timeouts, signals, real subprocess trees) need
    // more headroom than vitest's 5s default.
    testTimeout: 20_000,
    // Vitest 4 renamed `poolOptions.forks.maxForks` -> top-level `maxWorkers`.
    maxWorkers,
  },
})
