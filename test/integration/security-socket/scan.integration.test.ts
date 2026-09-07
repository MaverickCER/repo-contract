import { sync as spawnSync } from "cross-spawn"
import { describe, expect, it } from "vitest"
import { runSecuritySocketScan } from "../../../scripts/security-socket/scan.js"

/**
 * Runs `runSecuritySocketScan()` for real -- no mocking of `cross-spawn` or the `socket` binary --
 * against whatever `@socketsecurity/cli` install and Socket org credentials the running
 * environment actually has. This is real-behavior-over-mocking, this repository's own house style
 * (see `test/integration/suppression-governance/check.integration.test.ts`), applied to the one
 * outcome this environment can actually produce deterministically: an installed-but-unauthenticated
 * CLI (CI, and every contributor machine absent an explicit `socket login`, holds no Socket org
 * token), or -- if the binary genuinely isn't resolvable -- a spawn failure.
 *
 * The distinction is asserted deterministically rather than accepting either reason: when a
 * `socket` executable does resolve, `"cli-not-installed"` would mean a *broken* spawn resolution
 * path -- a real regression this test must catch, not mask.
 */

/**
 * Whether `spawnSync("socket", ...)` -- the exact call `runSecuritySocketScan` makes -- can
 * resolve the executable at all. Probes with the real spawn (through `cross-spawn`, same as the
 * scanner) and reads back `runSecuritySocketScan`'s own dividing line: only `ENOENT` means "not
 * installed"; any other outcome (a clean run, a non-zero exit, even `EACCES`) means an executable
 * was found, which is what makes the scan report `"not-authenticated"` rather than
 * `"cli-not-installed"`.
 * @returns `true` if a `socket` executable resolves.
 */
function socketExecutableResolves(): boolean {
  const probe = spawnSync("socket", ["--version"], { encoding: "utf8", timeout: 60_000 })
  if (!probe.error) return true
  return (probe.error as NodeJS.ErrnoException).code !== "ENOENT"
}

describe("runSecuritySocketScan -- real @socketsecurity/cli", () => {
  it(
    "reports the deterministic unavailable reason for this environment",
    () => {
      const evidence = runSecuritySocketScan()

      expect(evidence.status).toBe("unavailable")
      if (evidence.status !== "unavailable") throw new Error("expected status: unavailable")

      // Anything other than "unavailable" would mean this environment unexpectedly holds live
      // Socket org credentials (a real "failed"/"passed"/"error"), worth knowing about, not
      // silently accepting.
      expect(evidence.reason).toBe(
        socketExecutableResolves() ? "not-authenticated" : "cli-not-installed",
      )
    },
    // `runSecuritySocketScan` calls `spawnSync` with its own 5-minute deadline; an
    // unauthenticated CLI returns near-instantly in practice, but the test's own timeout must
    // still sit above that worst case so a genuinely wedged binary fails as a timeout here
    // rather than as an ambiguous Vitest 20s cutoff mid-spawn.
    6 * 60 * 1000,
  )
})
