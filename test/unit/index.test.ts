import { describe, expect, it } from "vitest"
import * as repoContract from "../../src/index.js"
import { testEnv } from "../helpers/test-env.js"
import { testSpawn } from "../helpers/test-spawn.js"

/**
 * A smoke test of the package's public barrel itself -- every other test
 * file imports directly from internal submodules for precision, but nothing
 * else exercises `src/index.ts`'s actual re-exports. This both provides
 * coverage of the barrel file and guards against a re-export typo/omission
 * that submodule-level tests would never catch.
 */
describe("public API barrel (src/index.ts)", () => {
  it("exports defineRepoContract and runRepoContract as functions", () => {
    expect(typeof repoContract.defineRepoContract).toBe("function")
    expect(typeof repoContract.runRepoContract).toBe("function")
  })

  it("exports the full error hierarchy", () => {
    expect(typeof repoContract.RepoContractError).toBe("function")
    expect(typeof repoContract.InvalidRepoContractConfigError).toBe("function")
    expect(typeof repoContract.InvalidCheckConfigError).toBe("function")
    expect(typeof repoContract.ParserDependencyMissingError).toBe("function")
    expect(typeof repoContract.PolicyThrewError).toBe("function")
    expect(typeof repoContract.PolicyReadUnrequestedOutputError).toBe("function")
    expect(typeof repoContract.PolicyReadFailedParseValueError).toBe("function")
  })

  it("does not export internal implementation modules", () => {
    expect("spawnCheck" in repoContract).toBe(false)
    expect("tokenizeRunString" in repoContract).toBe(false)
    expect("runChecks" in repoContract).toBe(false)
    expect("validateRepoContractConfig" in repoContract).toBe(false)
  })

  it("runs a real end-to-end check through only the public exports", async () => {
    const config = repoContract.defineRepoContract({
      checks: {
        tests: {
          run: [process.execPath, "-e", "process.exit(0)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "exited 0" }
              : { outcome: "fail", rationale: "expected exit code 0" },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    const { evidence, verdict } = await repoContract.runRepoContract(config)

    expect(evidence.checks.tests.exitCode).toBe(0)
    expect(verdict.passed).toBe(true)
  })
})
