import { describe, expect, it } from "vitest"
import { runSecuritySocketScan } from "../../../scripts/security-socket/scan.js"

/**
 * Runs `runSecuritySocketScan()` for real -- no mocking of `cross-spawn` or the `socket` binary --
 * against whatever `@socketsecurity/cli` install and Socket org credentials the running
 * environment actually has. This is real-behavior-over-mocking, this repository's own house style
 * (see `test/integration/suppression-governance/check.integration.test.ts`), applied to the one
 * outcome this environment can actually produce deterministically: an installed but
 * unauthenticated CLI. CI (and every contributor machine, absent an explicit Socket login) holds
 * no Socket org token, so `"not-authenticated"` is the one real-world case this test can assert
 * end-to-end without a live, authenticated org -- exactly the scenario
 * scripts/security-socket/evidence-types.ts's own doc comment documents as confirmed by direct
 * observation.
 */
describe("runSecuritySocketScan -- real @socketsecurity/cli", () => {
  it("reports 'unavailable: not-authenticated' against an unauthenticated installed CLI", () => {
    const evidence = runSecuritySocketScan()

    // `cli-not-installed` is accepted too, in case this specific test environment (unlike this
    // repository's own devDependency-installed one) genuinely lacks the binary -- the two
    // `unavailable` reasons are what a real, credential-less run can produce; anything else
    // (a real "failed"/"passed"/"error") would mean this environment unexpectedly holds live
    // Socket org credentials, which is worth knowing about, not silently accepting.
    expect(evidence.status).toBe("unavailable")
    if (evidence.status !== "unavailable") throw new Error("expected status: unavailable")
    expect(["not-authenticated", "cli-not-installed"]).toContain(evidence.reason)
  })
})
