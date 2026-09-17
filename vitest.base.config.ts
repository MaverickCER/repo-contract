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
// capped well below the machine's own core count (minimum 2 on a host with at least two cores --
// a genuine 1-core host still gets 1, never oversubscribed; see the `Math.min` below) rather than
// left at Vitest's own default (one worker per core): each of
// these four test categories is itself one of repo-contract's own
// concurrently-scheduled checks (`repo-contract.config.ts` has no
// `dependsOn`/`isolated` between test-property/test-e2e and the rest of the
// reader phase), and repo-contract's own check-level concurrency independently
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
// afterward, every time, with zero failures.
//
// `test-unit`/`test-integration` are now *also* `isolated: true` in
// repo-contract.config.ts (see that file's own comment), which removes their
// contention with the rest of the reader fleet named above entirely. Despite
// that, this same class of failure (a whole suite aborting under load, no
// single assertion to point at) still reproduced against real, ordinary
// background load on a contributor machine (an IDE, a browser, this very
// toolchain's own orchestrator process) -- load that lives entirely outside
// repo-contract's own scheduling and that `isolated` therefore cannot budget
// against. A quarter of the core count (rather than half) leaves real margin
// for that ambient, non-repo-contract load too, not just this repository's
// own concurrently-scheduled checks; the wall-clock cost of fewer workers is
// accepted in exchange for a run that doesn't fail from contention no config
// change inside this repository alone can fully see.
//
// The outer `Math.min(os.availableParallelism(), ...)` keeps the `Math.max(2, ...)` floor below
// from ever exceeding the host's own core count: on a genuine 1-core host, `Math.floor(1 / 4)` is
// `0`, and the floor alone would still force 2 workers -- oversubscribing the one real core it has
// -- to chase parallelism a 1-core host cannot use for CPU-bound work. Every realistic dev/CI host
// (2+ cores) is unaffected: `Math.min` only ever binds on a 1-core host.
const maxWorkers = Math.min(
  os.availableParallelism(),
  Math.max(2, Math.floor(os.availableParallelism() / 4)),
)

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
