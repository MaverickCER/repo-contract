import { describe, expect, it } from "vitest"
import { runPolicies } from "../../../src/policy/run-policies.js"
import {
  PolicyReadFailedParseValueError,
  PolicyReadUnrequestedOutputError,
  PolicyThrewError,
} from "../../../src/errors.js"
import type { ParsedCheckEntry } from "../../../src/evidence/build-evidence.js"
import type { CheckDefinition, CheckEvidence, Evidence, PolicyResult } from "../../../src/types.js"

function rawEvidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "echo",
    args: ["hi"],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "hi",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

function makeEvidence(checks: Record<string, CheckEvidence>): Evidence {
  return {
    version: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    checks,
  }
}

describe("runPolicies", () => {
  it("passes when the policy returns outcome: pass", async () => {
    const evidence = makeEvidence({ tests: rawEvidence() })
    const check: CheckDefinition = {
      run: "npm test",
      policy: () => ({ outcome: "pass", rationale: "exit code 0" }),
    }
    const entries: readonly ParsedCheckEntry[] = [["tests", check, rawEvidence()]]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.version).toBe(2)
    expect(verdict.passed).toBe(true)
    expect(verdict.checks.tests).toEqual({ outcome: "pass", rationale: "exit code 0" })
  })

  it("fails with the policy's returned rationale", async () => {
    const evidence = makeEvidence({ mutation: rawEvidence() })
    const check: CheckDefinition = {
      run: "npm run mutation",
      policy: () => ({
        outcome: "fail",
        rationale: "Mutation score must be at least 90%",
      }),
    }
    const entries: readonly ParsedCheckEntry[] = [["mutation", check, rawEvidence()]]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.passed).toBe(false)
    expect(verdict.checks.mutation).toEqual({
      outcome: "fail",
      rationale: "Mutation score must be at least 90%",
    })
  })

  it("does not fail the run when a policy returns outcome: warn -- warn is non-blocking", async () => {
    const evidence = makeEvidence({ "security-deps": rawEvidence() })
    const check: CheckDefinition = {
      run: "npm audit",
      policy: () => ({
        outcome: "warn",
        rationale:
          "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 2 low " +
          "vulnerabilities were found. Low-severity vulnerabilities are non-blocking under " +
          "repository policy.",
      }),
    }
    const entries: readonly ParsedCheckEntry[] = [["security-deps", check, rawEvidence()]]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.passed).toBe(true)
    expect(verdict.checks["security-deps"]).toEqual({
      outcome: "warn",
      rationale:
        "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 2 low " +
        "vulnerabilities were found. Low-severity vulnerabilities are non-blocking under " +
        "repository policy.",
    })
  })

  it("a warn outcome mixed with an otherwise-passing run still leaves verdict.passed true", async () => {
    const evidence = makeEvidence({ a: rawEvidence(), b: rawEvidence() })
    const entries: readonly ParsedCheckEntry[] = [
      ["a", { run: "a", policy: () => ({ outcome: "pass", rationale: "ok" }) }, rawEvidence()],
      [
        "b",
        { run: "b", policy: () => ({ outcome: "warn", rationale: "notable but non-blocking" }) },
        rawEvidence(),
      ],
    ]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.passed).toBe(true)
    expect(verdict.checks.a?.outcome).toBe("pass")
    expect(verdict.checks.b?.outcome).toBe("warn")
  })

  it("every check's rationale is a plain string, for every outcome", async () => {
    const evidence = makeEvidence({ a: rawEvidence(), b: rawEvidence(), c: rawEvidence() })
    const entries: readonly ParsedCheckEntry[] = [
      [
        "a",
        { run: "a", policy: () => ({ outcome: "pass", rationale: "a's rationale" }) },
        rawEvidence(),
      ],
      [
        "b",
        { run: "b", policy: () => ({ outcome: "fail", rationale: "b's rationale" }) },
        rawEvidence(),
      ],
      [
        "c",
        { run: "c", policy: () => ({ outcome: "warn", rationale: "c's rationale" }) },
        rawEvidence(),
      ],
    ]

    const verdict = await runPolicies(entries, evidence)

    for (const result of Object.values(verdict.checks)) {
      expect(typeof result.rationale).toBe("string")
    }
  })

  it("a PolicyResult survives a JSON.stringify/JSON.parse round-trip unchanged -- it is fully serializable", async () => {
    const evidence = makeEvidence({ lint: rawEvidence() })
    const check: CheckDefinition = {
      run: "eslint .",
      policy: () => ({
        outcome: "fail",
        rationale:
          "ESLint reported 2 errors:\n" +
          "- src/foo.ts:12:4 [no-explicit-any]: Unexpected any.\n" +
          "- src/bar.ts:41:7 [no-unused-vars]: 'value' is assigned a value but never used.",
      }),
    }
    const entries: readonly ParsedCheckEntry[] = [["lint", check, rawEvidence()]]

    const verdict = await runPolicies(entries, evidence)
    const roundTripped = JSON.parse(JSON.stringify(verdict)) as typeof verdict

    expect(roundTripped).toEqual(verdict)
  })

  it("supports an async policy", async () => {
    const evidence = makeEvidence({ tests: rawEvidence() })
    const check: CheckDefinition = {
      run: "npm test",
      policy: async (): Promise<PolicyResult> => {
        await Promise.resolve()
        return { outcome: "pass", rationale: "async pass" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["tests", check, rawEvidence()]]

    const verdict = await runPolicies(entries, evidence)
    expect(verdict.passed).toBe(true)
  })

  it("verdict.passed is false if any check's outcome is fail, regardless of the others", async () => {
    const evidence = makeEvidence({ a: rawEvidence(), b: rawEvidence() })
    const entries: readonly ParsedCheckEntry[] = [
      ["a", { run: "a", policy: () => ({ outcome: "pass", rationale: "ok" }) }, rawEvidence()],
      [
        "b",
        { run: "b", policy: () => ({ outcome: "fail", rationale: "b failed" }) },
        rawEvidence(),
      ],
    ]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.passed).toBe(false)
    expect(verdict.checks.a).toEqual({ outcome: "pass", rationale: "ok" })
    expect(verdict.checks.b).toEqual({ outcome: "fail", rationale: "b failed" })
  })

  it("one failing check does not collapse into or affect another check's own result -- each check's PolicyResult is independent", async () => {
    const evidence = makeEvidence({ a: rawEvidence(), b: rawEvidence(), c: rawEvidence() })
    const entries: readonly ParsedCheckEntry[] = [
      [
        "a",
        { run: "a", policy: () => ({ outcome: "pass", rationale: "a's own rationale" }) },
        rawEvidence(),
      ],
      [
        "b",
        { run: "b", policy: () => ({ outcome: "fail", rationale: "b's own specific reason" }) },
        rawEvidence(),
      ],
      [
        "c",
        { run: "c", policy: () => ({ outcome: "pass", rationale: "c's own rationale" }) },
        rawEvidence(),
      ],
    ]

    const verdict = await runPolicies(entries, evidence)

    expect(verdict.checks.a).toEqual({ outcome: "pass", rationale: "a's own rationale" })
    expect(verdict.checks.b).toEqual({ outcome: "fail", rationale: "b's own specific reason" })
    expect(verdict.checks.c).toEqual({ outcome: "pass", rationale: "c's own rationale" })
  })

  it("a policy receives its own check's evidence as ctx.result", async () => {
    const raw = rawEvidence({ stdout: "specific-output" })
    const evidence = makeEvidence({ tests: raw })
    let observed: CheckEvidence | undefined
    const check: CheckDefinition = {
      run: "npm test",
      policy: (ctx) => {
        observed = ctx.result
        return { outcome: "pass", rationale: "ok" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["tests", check, raw]]

    await runPolicies(entries, evidence)

    expect(observed?.stdout).toBe("specific-output")
  })

  it("a policy can read the full run's evidence, including sibling checks, via ctx.evidence", async () => {
    const testsEvidence = rawEvidence({ exitCode: 0 })
    const mutationEvidence = rawEvidence({ stdout: '{"score":86}' })
    const evidence = makeEvidence({ tests: testsEvidence, mutation: mutationEvidence })

    let sawSiblingEvidence = false
    const mutationCheck: CheckDefinition = {
      run: "npm run mutation",
      policy: (ctx) => {
        sawSiblingEvidence = ctx.evidence.checks.tests?.exitCode === 0
        return { outcome: "pass", rationale: "ok" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["mutation", mutationCheck, mutationEvidence]]

    await runPolicies(entries, evidence)

    expect(sawSiblingEvidence).toBe(true)
  })

  it("evidence stays available on ctx.result independent of the PolicyResult the policy returns -- evidence and policy interpretation are separate concerns", async () => {
    const raw = rawEvidence({ exitCode: 1, stdout: "raw output" })
    const evidence = makeEvidence({ tests: raw })
    let observedEvidence: CheckEvidence | undefined
    const check: CheckDefinition = {
      run: "npm test",
      policy: (ctx) => {
        observedEvidence = ctx.result
        return { outcome: "fail", rationale: "exit code was non-zero" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["tests", check, raw]]

    const verdict = await runPolicies(entries, evidence)

    expect(observedEvidence?.exitCode).toBe(1)
    expect(observedEvidence?.stdout).toBe("raw output")
    expect(verdict.checks.tests).toEqual({ outcome: "fail", rationale: "exit code was non-zero" })
  })

  it("a policy with dependsOn sees exactly its declared dependencies' evidence via ctx.dependencies, not the whole graph", async () => {
    const aEvidence = rawEvidence({ stdout: "a-output" })
    const bEvidence = rawEvidence({ stdout: "b-output" })
    const cEvidence = rawEvidence({ stdout: "c-output" })
    const evidence = makeEvidence({ a: aEvidence, b: bEvidence, c: cEvidence })

    let observed: Readonly<Record<string, CheckEvidence>> | undefined
    const cCheck: CheckDefinition = {
      run: "c",
      dependsOn: ["a"],
      policy: (ctx) => {
        observed = ctx.dependencies
        return { outcome: "pass", rationale: "ok" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["c", cCheck, cEvidence]]

    await runPolicies(entries, evidence)

    expect(Object.keys(observed ?? {})).toEqual(["a"])
    expect(observed?.a).toEqual(aEvidence)
  })

  it("a policy with no dependsOn sees ctx.dependencies as an empty object, never undefined", async () => {
    const raw = rawEvidence()
    const evidence = makeEvidence({ tests: raw })
    let observed: Readonly<Record<string, CheckEvidence>> | undefined
    const check: CheckDefinition = {
      run: "npm test",
      policy: (ctx) => {
        observed = ctx.dependencies
        return { outcome: "pass", rationale: "ok" }
      },
    }

    await runPolicies([["tests", check, raw]], evidence)

    expect(observed).toEqual({})
  })

  it("invokes the policy for a check whose status is spawn_error, not just completed checks", async () => {
    const raw = rawEvidence({ status: "spawn_error", exitCode: null, spawnError: "ENOENT" })
    const evidence = makeEvidence({ broken: raw })
    let observedStatus: string | undefined
    const check: CheckDefinition = {
      run: "not-a-real-binary",
      policy: (ctx) => {
        observedStatus = ctx.result.status
        return ctx.result.exitCode === 0
          ? { outcome: "pass", rationale: "ok" }
          : { outcome: "fail", rationale: "did not complete" }
      },
    }
    const entries: readonly ParsedCheckEntry[] = [["broken", check, raw]]

    const verdict = await runPolicies(entries, evidence)

    expect(observedStatus).toBe("spawn_error")
    expect(verdict.checks.broken).toEqual({ outcome: "fail", rationale: "did not complete" })
  })

  it("invokes the policy for a check whose status is timed_out", async () => {
    const raw = rawEvidence({ status: "timed_out", exitCode: null })
    const evidence = makeEvidence({ slow: raw })
    let observedStatus: string | undefined
    const check: CheckDefinition = {
      run: "sleep",
      policy: (ctx) => {
        observedStatus = ctx.result.status
        return { outcome: "pass", rationale: "ok" }
      },
    }
    await runPolicies([["slow", check, raw]], evidence)
    expect(observedStatus).toBe("timed_out")
  })

  it("invokes the policy for a check whose status is aborted", async () => {
    const raw = rawEvidence({ status: "aborted", exitCode: null })
    const evidence = makeEvidence({ cancelled: raw })
    let observedStatus: string | undefined
    const check: CheckDefinition = {
      run: "sleep",
      policy: (ctx) => {
        observedStatus = ctx.result.status
        return { outcome: "pass", rationale: "ok" }
      },
    }
    await runPolicies([["cancelled", check, raw]], evidence)
    expect(observedStatus).toBe("aborted")
  })

  it("handles zero checks -- passed is vacuously true", async () => {
    const evidence = makeEvidence({})
    const verdict = await runPolicies([], evidence)
    expect(verdict.passed).toBe(true)
    expect(verdict.checks).toEqual({})
  })

  describe("policy throwing", () => {
    it("a synchronously-throwing policy rejects with PolicyThrewError, preserving the original error as cause", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const originalError = new TypeError("cannot read score of undefined")
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          throw originalError
        },
      }

      await expect(runPolicies([["tests", check, raw]], evidence)).rejects.toThrow(PolicyThrewError)

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        const typed = error as PolicyThrewError
        expect(typed.checkId).toBe("tests")
        expect(typed.cause).toBe(originalError)
      }
    })

    it("a policy returning a promise that later rejects also rejects with PolicyThrewError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const originalError = new Error("async failure")
      const check: CheckDefinition = {
        run: "npm test",
        policy: async () => {
          await Promise.resolve()
          throw originalError
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect((error as PolicyThrewError).cause).toBe(originalError)
      }
    })

    it("preserves a non-Error thrown value verbatim as cause", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately testing a non-Error throw
          throw "a string throw"
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect((error as PolicyThrewError).cause).toBe("a string throw")
      }
    })

    it("one throwing policy does not stop any other check's policy from running", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ a: raw, b: raw })
      let bRan = false
      const entries: readonly ParsedCheckEntry[] = [
        [
          "a",
          {
            run: "a",
            policy: () => {
              throw new Error("a's policy is broken")
            },
          },
          raw,
        ],
        [
          "b",
          {
            run: "b",
            policy: () => {
              bRan = true
              return { outcome: "pass", rationale: "ok" }
            },
          },
          raw,
        ],
      ]

      await expect(runPolicies(entries, evidence)).rejects.toThrow(PolicyThrewError)
      expect(bRan).toBe(true)
    })

    it("two or more policies throwing simultaneously rejects with an AggregateError containing one PolicyThrewError per failing check", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ a: raw, b: raw, c: raw })
      const entries: readonly ParsedCheckEntry[] = [
        [
          "a",
          {
            run: "a",
            policy: () => {
              throw new Error("a broke")
            },
          },
          raw,
        ],
        ["b", { run: "b", policy: () => ({ outcome: "pass", rationale: "ok" }) }, raw],
        [
          "c",
          {
            run: "c",
            policy: () => {
              throw new Error("c broke")
            },
          },
          raw,
        ],
      ]

      try {
        await runPolicies(entries, evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError)
        const aggregate = error as AggregateError
        expect(aggregate.errors).toHaveLength(2)
        expect(aggregate.errors.every((e: unknown) => e instanceof PolicyThrewError)).toBe(true)
        const checkIds = (aggregate.errors as PolicyThrewError[]).map((e) => e.checkId).sort()
        expect(checkIds).toEqual(["a", "c"])
        expect(aggregate.message).toBe(
          "2 check policies threw instead of returning a PolicyResult.",
        )
      }
    })
  })

  describe("unrequested output access", () => {
    it("a policy reading result.output.value on a check with no output format rejects with PolicyReadUnrequestedOutputError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: (ctx) => {
          const score = (ctx.result.output as unknown as { value: { score: number } }).value.score
          return score >= 90
            ? { outcome: "pass", rationale: "score is high enough" }
            : { outcome: "fail", rationale: "score is too low" }
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadUnrequestedOutputError)
        const typed = error as PolicyReadUnrequestedOutputError
        expect(typed.checkId).toBe("mutation")
        expect(typed.cause).toBeInstanceOf(TypeError)
        expect(typed.message).toContain('Policy for check "mutation" read `result.output.value`')
        expect(typed.message).toContain('output: { format: "json" }')
        expect(typed.message).toContain(
          "narrow with `result.output?.success` before reading `.value`/`.error`.",
        )
      }
    })

    it("a policy reading result.output.success on a check with no output format also rejects with PolicyReadUnrequestedOutputError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ lint: raw })
      const check: CheckDefinition = {
        run: "eslint .",
        // Deliberately omits the `?.` guard this test exists to catch -- the cast mimics a
        // consumer who (wrongly) assumed `result.output` is always present.
        policy: (ctx) =>
          (ctx.result.output as unknown as { success: boolean }).success
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "not ok" },
      }

      try {
        await runPolicies([["lint", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadUnrequestedOutputError)
        expect((error as PolicyReadUnrequestedOutputError).message).toContain(
          "read `result.output.success`",
        )
      }
    })

    it("a policy reading result.output.error on a check with no output format also rejects with PolicyReadUnrequestedOutputError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ lint: raw })
      const check: CheckDefinition = {
        run: "eslint .",
        policy: (ctx) => {
          const error = (ctx.result.output as unknown as { error: string }).error
          return error.length === 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "not ok" }
        },
      }

      try {
        await runPolicies([["lint", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadUnrequestedOutputError)
        expect((error as PolicyReadUnrequestedOutputError).message).toContain(
          "read `result.output.error`",
        )
      }
    })

    it("a policy reading result.output.format on a check with no output format also rejects with PolicyReadUnrequestedOutputError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ lint: raw })
      const check: CheckDefinition = {
        run: "eslint .",
        policy: (ctx) => {
          const format = (ctx.result.output as unknown as { format: string }).format
          return format.length === 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "not ok" }
        },
      }

      try {
        await runPolicies([["lint", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadUnrequestedOutputError)
        expect((error as PolicyReadUnrequestedOutputError).message).toContain(
          "read `result.output.format`",
        )
      }
    })

    it("does not misfire for a TypeError message with extra text before the recognized shape -- the match must anchor to the start", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          throw new TypeError("prefix: Cannot read properties of undefined (reading 'value')")
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })

    it("does not misfire for a TypeError message with extra text after the recognized shape -- the match must anchor to the end", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          throw new TypeError("Cannot read properties of undefined (reading 'value') and more")
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })

    it("does not misfire when the check's own evidence.output is actually defined -- some unrelated undefined value stays a plain PolicyThrewError", async () => {
      const raw = rawEvidence({ output: { format: "json", success: true, value: { score: 90 } } })
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: () => {
          const other = undefined as unknown as { value: number }
          return other.value > 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "no" }
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })

    it("does not misfire for a TypeError reading a property that isn't one of ParsedOutput's own fields", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          const other = undefined as unknown as { totallyUnrelated: number }
          return other.totallyUnrelated > 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "no" }
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })

    it("does not misfire for a plain Error, even one whose message happens to match", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => {
          throw new Error("Cannot read properties of undefined (reading 'value')")
        },
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })

    it("a mix of a plain throw and an unrequested-output read both surface in one AggregateError, each keeping its own error type", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ a: raw, b: raw })
      const entries: readonly ParsedCheckEntry[] = [
        [
          "a",
          {
            run: "a",
            policy: () => {
              throw new Error("a broke")
            },
          },
          raw,
        ],
        [
          "b",
          {
            run: "b",
            policy: (ctx) => {
              const value = (ctx.result.output as unknown as { value: number }).value
              return value > 0
                ? { outcome: "pass", rationale: "ok" }
                : { outcome: "fail", rationale: "no" }
            },
          },
          raw,
        ],
      ]

      try {
        await runPolicies(entries, evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError)
        const aggregate = error as AggregateError
        expect(aggregate.errors).toHaveLength(2)
        const errors = aggregate.errors as (PolicyThrewError | PolicyReadUnrequestedOutputError)[]
        const byId = Object.fromEntries(errors.map((e) => [e.checkId, e]))
        expect(byId.a).toBeInstanceOf(PolicyThrewError)
        expect(byId.a).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
        expect(byId.b).toBeInstanceOf(PolicyReadUnrequestedOutputError)
      }
    })
  })

  describe("failed-parse value access", () => {
    it("a policy reading result.output.value on a check whose parse failed rejects with PolicyReadFailedParseValueError", async () => {
      const raw = rawEvidence({
        output: { format: "json", success: false, error: "Unexpected token 'x'" },
      })
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: (ctx) => {
          const score = (ctx.result.output as unknown as { value: { score: number } }).value.score
          return score >= 90
            ? { outcome: "pass", rationale: "score is high enough" }
            : { outcome: "fail", rationale: "score is too low" }
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadFailedParseValueError)
        const typed = error as PolicyReadFailedParseValueError
        expect(typed.checkId).toBe("mutation")
        expect(typed.cause).toBeInstanceOf(TypeError)
        expect(typed.message).toContain(
          'Policy for check "mutation" read `result.output.value.score`',
        )
        expect(typed.message).toContain("check `result.output.success`")
        expect(typed.message).not.toContain("Unexpected token")
      }
    })

    it("does not require the read property to be one of ParsedOutput's own fields -- any property read off the missing .value counts", async () => {
      const raw = rawEvidence({ output: { format: "json", success: false, error: "bad json" } })
      const evidence = makeEvidence({ lint: raw })
      const check: CheckDefinition = {
        run: "eslint .",
        policy: (ctx) => {
          const results = (ctx.result.output as unknown as { value: { length: number } }).value
          return results.length === 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "not ok" }
        },
      }

      try {
        await runPolicies([["lint", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadFailedParseValueError)
        expect((error as PolicyReadFailedParseValueError).message).toContain(
          "read `result.output.value.length`",
        )
      }
    })

    it("does not misfire when the check's parse actually succeeded -- some unrelated undefined value stays a plain PolicyThrewError", async () => {
      const raw = rawEvidence({ output: { format: "json", success: true, value: { score: 90 } } })
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: () => {
          const other = undefined as unknown as { value: number }
          return other.value > 0
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "no" }
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadFailedParseValueError)
      }
    })

    it("does not misfire for a check with no output config at all -- that stays PolicyReadUnrequestedOutputError, not PolicyReadFailedParseValueError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: (ctx) => {
          const score = (ctx.result.output as unknown as { value: { score: number } }).value.score
          return score >= 90
            ? { outcome: "pass", rationale: "ok" }
            : { outcome: "fail", rationale: "no" }
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyReadUnrequestedOutputError)
        expect(error).not.toBeInstanceOf(PolicyReadFailedParseValueError)
      }
    })

    it("does not misfire for a non-TypeError throw on a check whose parse failed", async () => {
      const raw = rawEvidence({ output: { format: "json", success: false, error: "bad json" } })
      const evidence = makeEvidence({ mutation: raw })
      const check: CheckDefinition = {
        run: "npm run mutation",
        policy: () => {
          throw new Error("Cannot read properties of undefined (reading 'score')")
        },
      }

      try {
        await runPolicies([["mutation", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(error).not.toBeInstanceOf(PolicyReadFailedParseValueError)
      }
    })
  })

  describe("invalid PolicyResult", () => {
    it('rejects with PolicyThrewError when outcome is not "pass"/"fail"/"warn"', async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () =>
          ({ outcome: "failed", rationale: "typo'd outcome" }) as unknown as PolicyResult,
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        const typed = error as PolicyThrewError
        expect(typed.checkId).toBe("tests")
        expect((typed.cause as Error).message).toContain(
          '"outcome" must be "pass", "fail", or "warn"',
        )
        expect((typed.cause as Error).message).toContain('"failed"')
      }
    })

    it("describes a non-string outcome by its type, not as a quoted string", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => ({ outcome: 42, rationale: "ok" }) as unknown as PolicyResult,
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(((error as PolicyThrewError).cause as Error).message).toContain(
          '"outcome" must be "pass", "fail", or "warn", got number',
        )
      }
    })

    it("rejects with PolicyThrewError when rationale is not a string", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => ({ outcome: "pass", rationale: undefined }) as unknown as PolicyResult,
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect((error as PolicyThrewError).cause).toBeInstanceOf(Error)
        expect(((error as PolicyThrewError).cause as Error).message).toContain(
          '"rationale" must be a string',
        )
      }
    })

    it("rejects with PolicyThrewError when the policy returns a non-object value", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => undefined as unknown as PolicyResult,
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(((error as PolicyThrewError).cause as Error).message).toContain(
          'expected an object with "outcome" and "rationale", got undefined',
        )
      }
    })

    it('rejects with PolicyThrewError when the policy returns null, reporting "got null" rather than "got object"', async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ tests: raw })
      const check: CheckDefinition = {
        run: "npm test",
        policy: () => null as unknown as PolicyResult,
      }

      try {
        await runPolicies([["tests", check, raw]], evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyThrewError)
        expect(((error as PolicyThrewError).cause as Error).message).toContain(
          'expected an object with "outcome" and "rationale", got null',
        )
      }
    })

    it("a malformed result from one policy does not stop any other check's policy from running", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ a: raw, b: raw })
      let bRan = false
      const entries: readonly ParsedCheckEntry[] = [
        [
          "a",
          {
            run: "a",
            policy: () => ({ outcome: "nope" }) as unknown as PolicyResult,
          },
          raw,
        ],
        [
          "b",
          {
            run: "b",
            policy: () => {
              bRan = true
              return { outcome: "pass", rationale: "ok" }
            },
          },
          raw,
        ],
      ]

      await expect(runPolicies(entries, evidence)).rejects.toThrow(PolicyThrewError)
      expect(bRan).toBe(true)
    })

    it("a genuine throw and a malformed result in the same run both surface in one AggregateError", async () => {
      const raw = rawEvidence()
      const evidence = makeEvidence({ a: raw, b: raw, c: raw })
      const entries: readonly ParsedCheckEntry[] = [
        [
          "a",
          {
            run: "a",
            policy: () => {
              throw new Error("a broke")
            },
          },
          raw,
        ],
        ["b", { run: "b", policy: () => ({ outcome: "pass", rationale: "ok" }) }, raw],
        [
          "c",
          {
            run: "c",
            policy: () => ({ outcome: "fail" }) as unknown as PolicyResult,
          },
          raw,
        ],
      ]

      try {
        await runPolicies(entries, evidence)
        expect.unreachable("expected runPolicies to reject")
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError)
        const aggregate = error as AggregateError
        expect(aggregate.errors).toHaveLength(2)
        expect(aggregate.errors.every((e: unknown) => e instanceof PolicyThrewError)).toBe(true)
        const checkIds = (aggregate.errors as PolicyThrewError[]).map((e) => e.checkId).sort()
        expect(checkIds).toEqual(["a", "c"])
      }
    })
  })
})
