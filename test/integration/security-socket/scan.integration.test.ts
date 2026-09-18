import { sync as spawnSync } from "cross-spawn"
import { describe, expect, it } from "vitest"
import { runSecuritySocketScan } from "../../../scripts/security-socket/scan.js"

/**
 * Runs `runSecuritySocketScan()` for real -- no mocking of `cross-spawn` or the `socket` binary --
 * against whatever `@socketsecurity/cli` install and Socket org credentials the running
 * environment actually has. This is real-behavior-over-mocking, this repository's own house style
 * (see `test/integration/suppression-governance/check.integration.test.ts`).
 *
 * Two real environments are both legitimate and both asserted here, not just tolerated: CI and
 * most contributor machines hold no Socket org token at all (an installed-but-unauthenticated CLI,
 * or -- if the binary genuinely isn't resolvable -- a spawn failure); a machine with a real
 * `socket login` session (confirmed directly, 2026-09-16) instead gets a real `"passed"`/`"failed"`
 * result, which is exactly the path this scanner's own alerts-shape parsing needs a live target to
 * exercise at all (see this scanner's own `rawAlerts` handling -- its "populated alerts" branch has
 * never been reachable except against a real authenticated org). Asserting *both* outcomes here,
 * rather than only the unauthenticated one, means this test starts actually validating the parser
 * against Socket's real response shape whenever it's run somewhere that can, instead of silently
 * skipping that coverage forever.
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
    "reports a well-formed result for whichever real environment this actually is",
    async () => {
      const evidence = await runSecuritySocketScan(process.cwd())

      if (evidence.status === "unavailable") {
        // No Socket org credentials here -- CI, and most contributor machines absent an explicit
        // `socket login`. The reason is still asserted deterministically: when a `socket`
        // executable does resolve, "cli-not-installed" would mean a *broken* spawn resolution
        // path, a real regression this test must catch, not mask.
        expect(evidence.reason).toBe(
          socketExecutableResolves() ? "not-authenticated" : "cli-not-installed",
        )
        return
      }

      // A real authenticated session (confirmed directly on this machine, 2026-09-16) --
      // exercises the parser's actual response-shape handling for real, something no
      // unauthenticated environment ever could. `error` here would mean the parser rejected a
      // shape it should have recognized -- surface exactly what it saw.
      if (evidence.status === "error") {
        throw new Error(`runSecuritySocketScan reported "error": ${evidence.message}`)
      }
      expect(["passed", "failed"]).toContain(evidence.status)
      if (evidence.status === "failed") {
        // Real alerts reached this branch (Socket found something for real) -- confirm every one
        // is a genuinely well-formed NormalizedSocketAlert, not just that the array exists.
        expect(evidence.alerts.length).toBeGreaterThan(0)
        for (const alert of evidence.alerts) {
          expect(alert.id).toMatch(/^socket:.+@.+:.+$/)
          expect(alert.package.length).toBeGreaterThan(0)
          expect(alert.version.length).toBeGreaterThan(0)
          expect(alert.type.length).toBeGreaterThan(0)
          expect(["critical", "high", "middle", "low", "unknown"]).toContain(alert.severity)
        }
      }
    },
    // `runSecuritySocketScan` calls `spawnSync` with its own 5-minute deadline; an
    // unauthenticated CLI returns near-instantly in practice, but the test's own timeout must
    // still sit above that worst case so a genuinely wedged binary fails as a timeout here
    // rather than as an ambiguous Vitest 20s cutoff mid-spawn.
    6 * 60 * 1000,
  )
})
