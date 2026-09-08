import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runCoderabbitReview } from "../../../scripts/coderabbitai/review.js"

/**
 * Runs `runCoderabbitReview()` for real -- no mocking of `cross-spawn` or the `coderabbit`/`git`
 * binaries -- matching this repository's own real-behavior-over-mocking house style (see
 * `test/integration/suppression-governance/check.integration.test.ts`). Unlike
 * `test/integration/security-socket/scan.integration.test.ts` (which exercises Socket's real
 * unauthenticated-error path -- fast and free), a real, uncontrolled `coderabbit review --agent`
 * invocation here would start an actual, billable AI review against whatever this environment's
 * real CodeRabbit credentials allow -- never appropriate to trigger unconditionally from a test
 * suite. This test instead exercises the one real, fast, free, and fully deterministic path every
 * environment (this repository's own CI included) actually takes on every single real run: the
 * `env.CI` short-circuit, asserted by setting it explicitly rather than depending on whatever the
 * ambient test-runner environment happens to already have.
 */
describe("runCoderabbitReview -- real short-circuit path", () => {
  const originalCi = process.env.CI

  beforeEach(() => {
    process.env.CI = "1"
  })

  afterEach(() => {
    if (originalCi === undefined) delete process.env.CI
    else process.env.CI = originalCi
  })

  it("returns 'not-applicable: ci' without spawning any review process when CI is set", async () => {
    const evidence = await runCoderabbitReview(process.cwd())
    expect(evidence).toMatchObject({
      status: "not-applicable",
      reason: "ci",
      expectedProvider: "coderabbit-github-app",
      registryPath: ".repo-contract/exceptions/coderabbit.json",
    })
  })
})
