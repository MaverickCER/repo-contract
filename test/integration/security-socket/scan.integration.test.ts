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
 * The distinction is asserted deterministically rather than accepting either reason: whenever a
 * `socket` executable resolves (the devDependency `node_modules/.bin`, or anywhere on `PATH` --
 * `runSecuritySocketScan` spawns the bare name `"socket"`, so `PATH` is what actually decides),
 * `"cli-not-installed"` would mean a *broken* spawn resolution path -- a real regression this test
 * must catch, not mask.
 */
const EXECUTABLE_NAMES =
  process.platform === "win32" ? ["socket.cmd", "socket.exe", "socket"] : ["socket"]

/** Whether a `socket` executable resolves the same way `spawnSync("socket", ...)` would: `node_modules/.bin` first, then every `PATH` entry. */
function socketExecutableResolves(): boolean {
  const localBin = path.join("node_modules", ".bin", "socket")
  if (existsSync(localBin)) return true
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter((dir) => dir.length > 0)
  return pathDirs.some((dir) => EXECUTABLE_NAMES.some((name) => existsSync(path.join(dir, name))))
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
