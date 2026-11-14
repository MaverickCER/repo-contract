import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runCoderabbitReview } from "../../../scripts/coderabbitai/review.js"

/**
 * Runs `runCoderabbitReview()` for real (no mocking of `cross-spawn` or the `coderabbit`/`git`
 * binaries) matching this repository's own real-behavior-over-mocking house style (see
 * `test/integration/suppression-governance/check.integration.test.ts`). It differs from
 * `test/integration/security-socket/scan.integration.test.ts`, which exercises Socket's
 * unauthenticated-error path (fast and free). An uncontrolled `coderabbit review --agent` call here
 * would start a billable AI review with whatever CodeRabbit credentials this environment holds. A
 * test suite must never trigger that unconditionally. This test instead exercises the fast, free,
 * deterministic path every environment takes on every run, this repository's CI included: the
 * `env.CI` short-circuit. It sets `env.CI` explicitly rather than relying on the ambient
 * test-runner environment.
 */
describe("runCoderabbitReview: real short-circuit path", () => {
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
