import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { packTarball, runNpm } from "../../scripts/npm-pack.mjs"

/**
 * Shared by every "install the real packed tarball into a fresh consumer project" E2E test --
 * originally `test/e2e/consumer-install.test.ts` alone, now also
 * `consumer-install-bun.test.ts`/`consumer-install-deno.test.ts` (see
 * specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md). Each of those files only differs in which
 * runtime binary it hands the installed fixture's scripts to; the pack/install/cleanup mechanics
 * that get a real `npm install`-able tarball on disk are identical and worth keeping in one place.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

/**
 * These tests exercise `dist/`, not `../../src` -- required to have been built already (this
 * repo's `npm run verify`/CI always run `npm run build` before `npm run test:coverage`).
 * Callers `describe.skipIf(!distIsBuilt)` rather than failing confusingly, since `npm test` run in
 * isolation without a prior build is a real, reasonable thing a developer might do.
 */
export const distIsBuilt = existsSync(path.join(packageRoot, "dist", "index.js"))

interface ConsumerFixture {
  readonly consumerDir: string
  readonly tarballPath: string
}

/**
 * Packs this package with a real `npm pack` and installs the resulting tarball into a fresh,
 * empty temp project as a real dependency -- proving whatever runs against `consumerDir`
 * afterwards sees a genuine clean install (correct `exports` map, correct `dist/` contents), not
 * repository-local paths.
 * @param tmpDirPrefix - Prefix for the temp directory name, so a failed run's leftover directory
 * is identifiable by which runtime's test created it.
 * @returns The consumer project's directory and the tarball's path within it.
 */
export function createConsumerFixture(tmpDirPrefix: string): ConsumerFixture {
  const consumerDir = mkdtempSync(path.join(tmpdir(), tmpDirPrefix))

  // packTarball() packs `packageRoot` into `consumerDir` with `--ignore-scripts` (so `npm pack`
  // stays side-effect-free -- `dist/` is expected already built) and parses `npm pack --json`
  // tolerantly -- see scripts/npm-pack.mjs for why a bare `JSON.parse` was fragile, and why `npm`
  // needs platform-aware resolution here (this suite runs on windows-latest in CI).
  const { tarballPath } = packTarball(consumerDir, { cwd: packageRoot })

  writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "repo-contract-consumer-fixture", version: "0.0.0", type: "module" }),
  )

  const installResult = runNpm(["install", tarballPath, "--no-save"], { cwd: consumerDir })
  if (installResult.error) {
    throw new Error(`npm install could not be spawned: ${installResult.error.message}`)
  }
  if (installResult.status !== 0) {
    throw new Error(`npm install of the packed tarball failed: ${installResult.stderr}`)
  }

  return { consumerDir, tarballPath }
}

export function removeConsumerFixture(consumerDir: string | undefined): void {
  // Tolerate `undefined`: when `createConsumerFixture` throws in a suite's `beforeAll`, that
  // suite's `afterAll` still runs with `consumerDir` never assigned -- cleanup shouldn't then
  // throw a second, less informative error on top of the real failure.
  if (consumerDir === undefined) return
  try {
    // Same Windows EBUSY/EPERM tolerance as remove-temp-dir.ts -- see its doc
    // comment. A throwaway fixture the OS reaps anyway must not fail the run.
    rmSync(consumerDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Whether a runtime's own binary is resolvable on `PATH` at all -- distinct from `distIsBuilt`,
 * this is what lets the Bun/Deno E2E suites skip cleanly on a machine (or, deliberately, most CI
 * jobs -- see specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md) that never installed those
 * runtimes, rather than failing with a confusing spawn error. This runs at module load time (the
 * describe.skipIf condition), outside any test body, so a `spawnSync` that throws synchronously
 * instead of returning `{ error }` -- observed under heavy fork-level resource contention (this
 * repository's own `npm run contract` running all ~30 checks, including Stryker's own subprocess
 * fan-out, concurrently) -- must not crash the whole suite file. Treat that the same as "runtime
 * unavailable": skip, don't fail.
 * @param command - The runtime's executable name, e.g. `"bun"` or `"deno"`.
 * @returns Whether invoking `<command> --version` succeeded.
 */
export function isRuntimeAvailable(command: string): boolean {
  try {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" })
    return result.error === undefined && result.status === 0
  } catch {
    return false
  }
}
