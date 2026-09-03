import { existsSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  DependencyDeclaredLaterError,
  InvalidRepoContractConfigError,
  PolicyThrewError,
} from "../../src/errors.js"
import { runRepoContract } from "../../src/run-repo-contract.js"
import type { RepoContractConfig } from "../../src/types.js"
import { testEnv } from "../helpers/test-env.js"
import { testSpawn } from "../helpers/test-spawn.js"

const node = process.execPath

describe("runRepoContract", () => {
  it("handles zero checks -- passed is vacuously true, evidence.checks is empty", async () => {
    const { evidence, verdict } = await runRepoContract({
      checks: {},
      spawn: testSpawn,
      env: testEnv,
    })
    expect(verdict.passed).toBe(true)
    expect(verdict.checks).toEqual({})
    expect(evidence.checks).toEqual({})
    expect(evidence.version).toBe(1)
    expect(verdict.version).toBe(2)
  })

  it("runs one check end to end and reports a passing verdict", async () => {
    const { evidence, verdict } = await runRepoContract({
      checks: {
        tests: {
          run: [node, "-e", "process.exit(0)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "exited 0" }
              : { outcome: "fail", rationale: "expected exit code 0" },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(evidence.checks.tests.exitCode).toBe(0)
    expect(verdict.passed).toBe(true)
    expect(verdict.checks.tests).toEqual({ outcome: "pass", rationale: "exited 0" })
  })

  it("runs many checks concurrently and aggregates a failing verdict when one fails", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        passing: {
          run: [node, "-e", "process.exit(0)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "exited 0" }
              : { outcome: "fail", rationale: "should have passed" },
        },
        failing: {
          run: [node, "-e", "process.exit(1)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "exited 0" }
              : {
                  outcome: "fail",
                  rationale: "Expected exit code 0, got " + String(result.exitCode),
                },
        },
        alsoPassing: {
          run: [node, "-e", "process.stdout.write('ok')"],
          policy: ({ result }) =>
            result.stdout === "ok"
              ? { outcome: "pass", rationale: "stdout was ok" }
              : { outcome: "fail", rationale: "wrong stdout" },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.checks.passing).toEqual({ outcome: "pass", rationale: "exited 0" })
    expect(verdict.checks.alsoPassing).toEqual({ outcome: "pass", rationale: "stdout was ok" })
    expect(verdict.checks.failing.outcome).toBe("fail")
    expect(verdict.checks.failing.rationale).toContain("got 1")
  })

  it("one failing check's evidence/verdict never leaks into or affects another check's own result", async () => {
    const { evidence, verdict } = await runRepoContract({
      checks: {
        broken: {
          run: "definitely-not-a-real-binary-xyz",
          policy: () => ({
            outcome: "fail",
            rationale: "should never even matter what this returns",
          }),
        },
        healthy: {
          run: [node, "-e", "process.stdout.write('healthy-output')"],
          policy: ({ result }) =>
            result.stdout === "healthy-output"
              ? { outcome: "pass", rationale: "stdout matched" }
              : { outcome: "fail", rationale: "wrong" },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(evidence.checks.broken.status).toBe("spawn_error")
    expect(evidence.checks.healthy.status).toBe("completed")
    expect(evidence.checks.healthy.stdout).toBe("healthy-output")
    expect(verdict.checks.healthy).toEqual({ outcome: "pass", rationale: "stdout matched" })
  })

  it("parses requested JSON output and makes it available to the policy", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        mutation: {
          run: [node, "-e", "process.stdout.write(JSON.stringify({score: 95}))"],
          output: { format: "json" },
          policy: ({ result }) => {
            if (!result.output?.success) {
              return { outcome: "fail", rationale: "expected successful parse" }
            }
            const value = result.output.value as { score: number }
            return value.score >= 90
              ? { outcome: "pass", rationale: `score ${String(value.score)} met the threshold` }
              : { outcome: "fail", rationale: "score too low" }
          },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.checks.mutation).toEqual({
      outcome: "pass",
      rationale: "score 95 met the threshold",
    })
  })

  it("throws InvalidRepoContractConfigError synchronously for a malformed config, before anything spawns", () => {
    // spawn/env are deliberately included and valid here, even though this test's own point is
    // checks: null: this assertion only checks the error *class* (both the checks-shape and
    // spawn/env checks throw the same InvalidRepoContractConfigError class), so without a valid
    // spawn/env, a config with checks:null but missing spawn would ALSO throw
    // InvalidRepoContractConfigError -- for "spawn must be a function" -- which would still satisfy
    // this class-only assertion for the wrong reason, masking a real regression in the checks:null
    // check specifically.
    const malformed = {
      checks: null,
      spawn: testSpawn,
      env: testEnv,
    } as unknown as RepoContractConfig
    // A genuine synchronous throw -- `runRepoContract` is not `async`, so a config problem throws
    // to this non-awaiting caller directly, before any Promise is even created (see
    // runRepoContract's own doc comment). `expect(() => ...).toThrow(...)`, not
    // `expect(runRepoContract(...)).rejects.toThrow(...)`, which only tests promise rejection.
    expect(() => runRepoContract(malformed)).toThrow(InvalidRepoContractConfigError)
  })

  it("rejects with PolicyThrewError when a policy throws, without corrupting the run", async () => {
    await expect(
      runRepoContract({
        checks: {
          broken: {
            run: [node, "-e", "process.exit(0)"],
            policy: () => {
              throw new Error("policy bug")
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      }),
    ).rejects.toThrow(PolicyThrewError)
  })

  it("a check's env value never surfaces in the thrown PolicyThrewError's own message (SECURITY.md)", async () => {
    const secret = "env-secret-must-not-leak-9f8e7d"
    let thrown: unknown
    try {
      await runRepoContract({
        checks: {
          broken: {
            run: [node, "-e", "process.exit(0)"],
            inheritEnv: false,
            env: { DEPLOY_TOKEN: secret },
            policy: () => {
              throw new Error("policy bug")
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(PolicyThrewError)
    // The message repo-contract authors carries only the check id and fixed
    // text. (`cause` deliberately preserves the original throw verbatim for
    // the consumer -- that is not a leak of anything repo-contract added.)
    expect((thrown as PolicyThrewError).message).not.toContain(secret)
    expect((thrown as PolicyThrewError).message).toContain("broken")
  })

  it("respects an explicit concurrency setting", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        a: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
        b: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
      },
      concurrency: 1,
      spawn: testSpawn,
      env: testEnv,
    })
    expect(verdict.passed).toBe(true)
  })

  it("a config-level shell: true actually reaches the spawned process, not just validation -- a check with no shell of its own still gets real shell interpretation", async () => {
    // Regression coverage for run-repo-contract.ts's `execution.shell = config.shell ?? false`:
    // this can only be distinguished from a config.shell that's silently dropped by observing real
    // shell-operator behavior (`&&`) at actual spawn time, through the full public pipeline -- a
    // validate-config.ts-level test alone only proves the *value* is accepted, not that it's wired
    // through to execution.
    const { evidence } = await runRepoContract({
      checks: {
        // No shell of its own: relies entirely on the config-level default reaching spawnCheck.
        both: {
          // `node` (process.execPath) is quoted -- on Windows this is commonly
          // "C:\Program Files\nodejs\node.exe", and unquoted would be split into two
          // tokens by the real shell this runs through (shell: true below).
          run: `"${node}" -e "process.stdout.write('a')" && "${node}" -e "process.stdout.write('b')"`,
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
      },
      shell: true,
      spawn: testSpawn,
      env: testEnv,
    })

    expect(evidence.checks.both.stdout).toBe("ab")
  })

  it("propagates a run-level AbortSignal through the whole pipeline -- an aborted check still gets a verdict entry", async () => {
    const controller = new AbortController()
    controller.abort("cancelled")

    const { evidence, verdict } = await runRepoContract(
      {
        checks: {
          cancelled: {
            run: [node, "-e", "process.exit(0)"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "exited 0" }
                : { outcome: "fail", rationale: "did not complete" },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      },
      { signal: controller.signal },
    )

    expect(evidence.checks.cancelled.status).toBe("aborted")
    expect(verdict.checks.cancelled).toEqual({ outcome: "fail", rationale: "did not complete" })
  })

  it("rejects a forward-referencing dependsOn synchronously, before any process spawns", () => {
    const markerPath = path.join(
      os.tmpdir(),
      `repo-contract-cycle-test-${String(process.pid)}-${String(Date.now())}.marker`,
    )
    try {
      // `a` depends on `b`, but `b` is declared *after* `a` -- a forward reference, which the new
      // declaration-order model rejects (dependsOn may only reference an earlier-declared check;
      // see DependencyDeclaredLaterError). A real cycle (`a`->`b`->`a`) is no longer expressible at
      // all once every edge must point backward -- whichever of the two is declared second would
      // already be a forward reference on its own, well before a cycle could ever form.
      expect(() =>
        runRepoContract({
          checks: {
            a: {
              run: [
                node,
                "-e",
                `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "ran")`,
              ],
              dependsOn: ["b"],
              policy: () => ({ outcome: "pass", rationale: "ok" }),
            },
            b: {
              run: [node, "-e", "process.exit(0)"],
              policy: () => ({ outcome: "pass", rationale: "ok" }),
            },
          },
          spawn: testSpawn,
          env: testEnv,
        }),
      ).toThrow(DependencyDeclaredLaterError)
      expect(existsSync(markerPath)).toBe(false)
    } finally {
      rmSync(markerPath, { force: true })
    }
  })

  it("a dependent's policy reads its dependency's evidence via ctx.dependencies, through the real end-to-end pipeline", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        build: {
          run: [node, "-e", "process.stdout.write('build-output')"],
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
        integration: {
          run: [node, "-e", "process.exit(0)"],
          dependsOn: ["build"],
          policy: (ctx) => {
            const buildOutput = ctx.dependencies.build?.stdout
            return buildOutput === "build-output"
              ? { outcome: "pass", rationale: "saw build's evidence" }
              : { outcome: "fail", rationale: "did not see build's evidence" }
          },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.checks.integration).toEqual({
      outcome: "pass",
      rationale: "saw build's evidence",
    })
  })

  it("a policy can read a sibling check's evidence via ctx.evidence, since all checks finish before any policy runs", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        tests: {
          run: [node, "-e", "process.exit(0)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "exited 0" }
              : { outcome: "fail", rationale: "tests failed" },
        },
        mutation: {
          run: [node, "-e", "process.stdout.write('80')"],
          policy: ({ result, evidence }) => {
            const testsPassed = evidence.checks.tests?.exitCode === 0
            if (!testsPassed) return { outcome: "fail", rationale: "only enforced if tests passed" }
            return Number(result.stdout) >= 90
              ? { outcome: "pass", rationale: "mutation score met the threshold" }
              : { outcome: "fail", rationale: "mutation score too low" }
          },
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.checks.mutation).toEqual({
      outcome: "fail",
      rationale: "mutation score too low",
    })
  })

  it("evidence.checks.<id> remains fully present and unaffected by verdict.checks.<id>'s shape -- evidence and policy interpretation stay independent", async () => {
    const { evidence, verdict } = await runRepoContract({
      checks: {
        tests: {
          run: [node, "-e", "process.stdout.write('some output'); process.exit(1)"],
          policy: () => ({ outcome: "fail", rationale: "exit code was non-zero" }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(evidence.checks.tests.exitCode).toBe(1)
    expect(evidence.checks.tests.stdout).toBe("some output")
    expect(verdict.checks.tests).toEqual({
      outcome: "fail",
      rationale: "exit code was non-zero",
    })
  })

  it("a failing check's rationale alone identifies the specific reason -- no need to rerun anything or inspect evidence separately", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        lint: {
          run: [node, "-e", "process.exit(1)"],
          policy: () => ({
            outcome: "fail",
            rationale:
              "ESLint reported 2 errors:\n" +
              "- src/foo.ts:12:4 [no-explicit-any]: Unexpected any.\n" +
              "- src/bar.ts:41:7 [no-unused-vars]: 'value' is assigned a value but never used.",
          }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.checks.lint.outcome).toBe("fail")
    expect(verdict.checks.lint.rationale).toContain("src/foo.ts:12:4")
    expect(verdict.checks.lint.rationale).toContain("src/bar.ts:41:7")
  })

  it("a passing policy can still communicate a warn outcome for noteworthy, non-blocking evidence -- warn does not fail the run", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        "security-deps": {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({
            outcome: "warn",
            rationale:
              "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 2 low " +
              "vulnerabilities were found. Low-severity vulnerabilities are non-blocking under " +
              "repository policy.",
          }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.passed).toBe(true)
    expect(verdict.checks["security-deps"].outcome).toBe("warn")
  })

  it("every PolicyResult survives a JSON.stringify/JSON.parse round-trip unchanged", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        tests: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "warn", rationale: "2 low-severity findings, non-blocking" }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    const roundTripped = JSON.parse(JSON.stringify(verdict)) as typeof verdict
    expect(roundTripped).toEqual(verdict)
  })

  it("parallel checks each produce their own independent PolicyResult", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        a: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "pass", rationale: "a passed" }),
        },
        b: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "warn", rationale: "b passed with a caveat" }),
        },
        c: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "fail", rationale: "c failed" }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    expect(verdict.checks.a).toEqual({ outcome: "pass", rationale: "a passed" })
    expect(verdict.checks.b).toEqual({ outcome: "warn", rationale: "b passed with a caveat" })
    expect(verdict.checks.c).toEqual({ outcome: "fail", rationale: "c failed" })
    expect(verdict.passed).toBe(false)
  })

  it("runRepoContract() itself never calls process.exit(), even on a failing multi-check run", async () => {
    // Scoped to runRepoContract()'s own execution path specifically, per VERSIONING.md's Stable-tier
    // guarantee -- not a claim that no code anywhere in this repository calls process.exit() (the
    // separate, repository-wide n/no-process-exit ESLint rule on src/** covers that). The spy throws
    // rather than silently recording a call, so a violation fails loudly at the call site itself.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit() must never be called by runRepoContract")
    })

    try {
      const { verdict } = await runRepoContract({
        checks: {
          passing: {
            run: [node, "-e", "process.exit(0)"],
            policy: () => ({ outcome: "pass", rationale: "ok" }),
          },
          failing: {
            run: [node, "-e", "process.exit(1)"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "ok" }
                : { outcome: "fail", rationale: "nonzero exit" },
          },
          // A spawn error is the execution outcome most likely to tempt a future implementer into
          // treating it as fatal to the whole run rather than just this one check's evidence.
          brokenSpawn: {
            run: "definitely-not-a-real-binary-xyz",
            policy: () => ({ outcome: "fail", rationale: "should never even matter" }),
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })

      expect(verdict.passed).toBe(false)
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it("every configured check id appears exactly once as a key in both evidence.checks and verdict.checks -- completed/timed_out/spawn_error, no abort involved", async () => {
    // Deliberately no AbortController here -- each status below is self-contained and settles at
    // its own pace with no cross-check timing dependency, so this stays fully deterministic. The
    // aborted case is exercised separately, in isolation, in the next test below.
    const { evidence, verdict } = await runRepoContract({
      checks: {
        completed: {
          run: [node, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
        timedOut: {
          run: [node, "-e", "setTimeout(() => {}, 30000)"],
          timeoutMs: 100,
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "ok" }
              : { outcome: "fail", rationale: "did not complete" },
        },
        brokenSpawn: {
          run: "definitely-not-a-real-binary-xyz",
          policy: () => ({ outcome: "fail", rationale: "should never even matter" }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    const configuredIds = ["completed", "timedOut", "brokenSpawn"]
    // Key-set equality asserted first and on its own, before any per-check status assertion, so a
    // violation of the actual named guarantee fails for that specific reason.
    expect(Object.keys(evidence.checks).sort()).toEqual([...configuredIds].sort())
    expect(Object.keys(verdict.checks).sort()).toEqual([...configuredIds].sort())
    expect(evidence.checks.completed.status).toBe("completed")
    expect(evidence.checks.timedOut.status).toBe("timed_out")
    expect(evidence.checks.brokenSpawn.status).toBe("spawn_error")
  })

  it("an aborted check still receives a well-formed evidence/verdict entry -- the configured check id appears exactly once even when the run itself is aborted", async () => {
    const controller = new AbortController()
    controller.abort("cancelled")

    const { evidence, verdict } = await runRepoContract(
      {
        checks: {
          cancelled: {
            run: [node, "-e", "process.exit(0)"],
            policy: () => ({ outcome: "pass", rationale: "ok" }),
          },
        },
        spawn: testSpawn,
        env: testEnv,
      },
      { signal: controller.signal },
    )

    expect(Object.keys(evidence.checks)).toEqual(["cancelled"])
    expect(Object.keys(verdict.checks)).toEqual(["cancelled"])
    expect(evidence.checks.cancelled.status).toBe("aborted")
  })
})
