import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Shared by every "install the real packed tarball into a fresh consumer project" E2E test --
 * originally `test/e2e/consumer-install.test.ts` alone, now also
 * `consumer-install-bun.test.ts`/`consumer-install-deno.test.ts` (see
 * specs/decisions/0011-bun-and-deno-runtime-support.md). Each of those files only differs in which
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

  // --ignore-scripts: without it, `npm pack` also runs this package's own `prepare` lifecycle
  // script (`npm run build`), whose console output (tsup's own build log) interleaves with and
  // corrupts the `--json` output below. `dist/` is already built by the time this runs (callers
  // skip entirely otherwise, see `distIsBuilt` above), so skipping lifecycle scripts here is also
  // strictly correct, not just a workaround.
  const packResult = spawnSync(
    "npm",
    ["pack", "--pack-destination", consumerDir, "--json", "--ignore-scripts"],
    { cwd: packageRoot, encoding: "utf8" },
  )
  if (packResult.status !== 0) {
    throw new Error(`npm pack failed: ${packResult.stderr}`)
  }
  const [packInfo] = JSON.parse(packResult.stdout) as { filename: string }[]
  if (!packInfo) throw new Error("npm pack produced no output")
  const tarballPath = path.join(consumerDir, packInfo.filename)

  writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "repo-contract-consumer-fixture", version: "0.0.0", type: "module" }),
  )

  const installResult = spawnSync("npm", ["install", tarballPath, "--no-save"], {
    cwd: consumerDir,
    encoding: "utf8",
  })
  if (installResult.status !== 0) {
    throw new Error(`npm install of the packed tarball failed: ${installResult.stderr}`)
  }

  return { consumerDir, tarballPath }
}

export function removeConsumerFixture(consumerDir: string): void {
  rmSync(consumerDir, { recursive: true, force: true })
}

/**
 * Whether a runtime's own binary is resolvable on `PATH` at all -- distinct from `distIsBuilt`,
 * this is what lets the Bun/Deno E2E suites skip cleanly on a machine (or, deliberately, most CI
 * jobs -- see specs/decisions/0011-bun-and-deno-runtime-support.md) that never installed those
 * runtimes, rather than failing with a confusing spawn error.
 * @param command - The runtime's executable name, e.g. `"bun"` or `"deno"`.
 * @returns Whether invoking `<command> --version` succeeded.
 */
export function isRuntimeAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" })
  return result.error === undefined && result.status === 0
}
