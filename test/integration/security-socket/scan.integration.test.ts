import { sync as spawnSync } from "cross-spawn"
import { describe, expect, it } from "vitest"
import { runSecuritySocketScan } from "../../../scripts/security-socket/scan.js"

/**
 * Runs `runSecuritySocketScan()` for real (no mocking of `cross-spawn` or the `socket` binary)
 * against whatever `@socketsecurity/cli` install and Socket org credentials the running
 * environment actually has. This is real-behavior-over-mocking, this repository's own house style
 * (see `test/integration/suppression-governance/check.integration.test.ts`).
 *
 * Two environments are both legitimate, and both are asserted here, not just tolerated. CI and most
 * contributor machines hold no Socket org token. They get an installed-but-unauthenticated CLI, or
 * a spawn failure if the binary isn't resolvable. A machine with a `socket login` session
 * (confirmed 2026-09-16) instead gets a `"passed"`/`"failed"` result. Only that path gives the
 * scanner's alerts-shape parsing a live target. See the scanner's `rawAlerts` handling: its
 * "populated alerts" branch is reachable only against an authenticated org. Asserting *both*
 * outcomes, rather than only the unauthenticated one, means this test validates the parser against
 * Socket's response shape wherever it can. Otherwise that coverage would be skipped forever.
 */

/**
 * Whether `spawnSync("socket", ...)` (the exact call `runSecuritySocketScan` makes) can
 * resolve the executable at all. Probes with the same spawn the scanner uses (through
 * `cross-spawn`) and applies `runSecuritySocketScan`'s dividing line. Only `ENOENT` means "not
 * installed". Any other outcome (a clean run, a non-zero exit, even `EACCES`) means an executable
 * was found. That is what makes the scan report `"not-authenticated"` rather than
 * `"cli-not-installed"`.
 * @returns `true` if a `socket` executable resolves.
 */
function socketExecutableResolves(): boolean {
  const probe = spawnSync("socket", ["--version"], { encoding: "utf8", timeout: 60_000 })
  if (!probe.error) return true
  return (probe.error as NodeJS.ErrnoException).code !== "ENOENT"
}

describe("runSecuritySocketScan: real @socketsecurity/cli", () => {
  it(
    "reports a well-formed result for whichever real environment this actually is",
    async () => {
      const evidence = await runSecuritySocketScan(process.cwd())

      if (evidence.status === "unavailable") {
        // No Socket org credentials here: CI, and most contributor machines absent an explicit
        // `socket login`. The reason is still asserted deterministically: when a `socket`
        // executable does resolve, "cli-not-installed" would mean a *broken* spawn resolution
        // path, a real regression this test must catch, not mask.
        expect(evidence.reason).toBe(
          socketExecutableResolves() ? "not-authenticated" : "cli-not-installed",
        )
        return
      }

      // A real authenticated session (confirmed directly on this machine, 2026-09-16):
      // exercises the parser's actual response-shape handling for real, something no
      // unauthenticated environment ever could. `error` here would mean the parser rejected a
      // shape it should have recognized: surface exactly what it saw.
      if (evidence.status === "error") {
        throw new Error(`runSecuritySocketScan reported "error": ${evidence.message}`)
      }
      expect(["passed", "failed"]).toContain(evidence.status)
      if (evidence.status === "failed") {
        // Real alerts reached this branch (Socket found something for real): confirm every one
        // is a genuinely well-formed NormalizedSocketAlert, not just that the array exists.
        expect(evidence.alerts.length).toBeGreaterThan(0)
        for (const alert of evidence.alerts) {
          expect(alert.id).toMatch(/^socket:.+@.+:.+$/)
          expect(alert.package.length).toBeGreaterThan(0)
          expect(alert.version.length).toBeGreaterThan(0)
          expect(alert.type.length).toBeGreaterThan(0)
          expect(["critical", "high", "middle", "low", "unknown"]).toContain(alert.severity)
          expect(alert.category.length).toBeGreaterThan(0)
          expect(typeof alert.shipped).toBe("boolean")
        }
      }
    },
    // `runSecuritySocketScan` calls `spawnSync` with a 5-minute deadline. An unauthenticated CLI
    // returns near-instantly in practice. The test's timeout must still sit above that worst case.
    // A wedged binary then fails as a timeout here, not as an ambiguous Vitest 20s cutoff
    // mid-spawn.
    6 * 60 * 1000,
  )
})
