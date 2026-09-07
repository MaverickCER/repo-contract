import { existsSync } from "node:fs"
import path from "node:path"
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
 * The distinction is asserted deterministically rather than accepting either reason: when
 * `node_modules/.bin/socket` exists (the devDependency-installed case, which the repository's own
 * test scripts also prepend to `PATH`), `"cli-not-installed"` would mean a *broken* spawn
 * resolution path -- a real regression this test must catch, not mask.
 */
const LOCAL_SOCKET_BIN = path.join("node_modules", ".bin", "socket")

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
        existsSync(LOCAL_SOCKET_BIN) ? "not-authenticated" : "cli-not-installed",
      )
    },
    // `runSecuritySocketScan` calls `spawnSync` with its own 5-minute deadline; an
    // unauthenticated CLI returns near-instantly in practice, but the test's own timeout must
    // still sit above that worst case so a genuinely wedged binary fails as a timeout here
    // rather than as an ambiguous Vitest 20s cutoff mid-spawn.
    6 * 60 * 1000,
  )
})
