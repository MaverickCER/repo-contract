import { describe, expect, expectTypeOf, it } from "vitest"
import { defineRepoContract } from "../../../src/config/define-repo-contract.js"
import type { PolicyResult } from "../../../src/types.js"
import { testEnv } from "../../helpers/test-env.js"
import { testSpawn } from "../../helpers/test-spawn.js"

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

describe("defineRepoContract", () => {
  it("returns the config unchanged (identity function, no validation, no cloning)", () => {
    const config = {
      checks: { tests: { run: "npm test", policy: okPolicy } },
      spawn: testSpawn,
      env: testEnv,
    }
    expect(defineRepoContract(config)).toBe(config)
  })

  it("does not throw for a structurally invalid config -- validation happens in runRepoContract, not here", () => {
    // Cast to defineRepoContract's own parameter type (rather than a
    // hand-named one) so this stays a pure runtime-behavior test even as
    // that type gains compile-time constraints (e.g. ValidatedCheckSchema's
    // dependsOn checking) -- this test is deliberately bypassing them, not
    // exercising them.
    const malformed = {
      checks: { tests: { run: 5, policy: okPolicy } },
    } as unknown as Parameters<typeof defineRepoContract>[0]
    expect(() => {
      defineRepoContract(malformed)
    }).not.toThrow()
  })

  describe("type inference", () => {
    // Deliberately no manual `ctx: PolicyContext<...>` annotation anywhere
    // below -- that would interfere with defineRepoContract's own generic
    // inference, and it isn't how a real consumer authors a config either.
    //
    // `output.value` is `unknown` for every format (see InferParsedValue's
    // doc comment in types.ts for why "text" isn't special-cased to
    // `string`), and `output` itself is always optional/possibly-undefined
    // on `ctx.result` regardless of whether that check's own config
    // requested a format -- narrowed with `ctx.result.output?.success`, not
    // a compile-time-absent key. Both are deliberate simplifications made
    // after a real, confirmed TypeScript inference limitation for a record
    // of heterogeneous per-check generics with policy callbacks (see
    // specs/decisions/).

    it("types result.output.value as unknown for a check with output.format: 'json'", () => {
      defineRepoContract({
        checks: {
          mutation: {
            run: "npm run mutation",
            output: { format: "json" },
            policy: (ctx) => {
              if (ctx.result.output?.success === true) {
                expectTypeOf(ctx.result.output.value).toEqualTypeOf<unknown>()
              }
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("types result.output.value as unknown for a check with output.format: 'yaml'", () => {
      defineRepoContract({
        checks: {
          report: {
            run: "some-tool",
            output: { format: "yaml" },
            policy: (ctx) => {
              if (ctx.result.output?.success === true) {
                expectTypeOf(ctx.result.output.value).toEqualTypeOf<unknown>()
              }
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("types result.output.value as unknown for a check with output.format: 'text' too", () => {
      defineRepoContract({
        checks: {
          version: {
            run: "some-tool --version",
            output: { format: "text" },
            policy: (ctx) => {
              if (ctx.result.output?.success === true) {
                expectTypeOf(ctx.result.output.value).toEqualTypeOf<unknown>()
              }
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("types result.output as possibly-undefined, requiring narrowing before use", () => {
      defineRepoContract({
        checks: {
          tests: {
            run: "npm test",
            policy: (ctx) => {
              expectTypeOf(ctx.result.output).toEqualTypeOf<
                | {
                    readonly format: "json" | "yaml" | "text"
                    readonly success: true
                    readonly value: unknown
                  }
                | {
                    readonly format: "json" | "yaml" | "text"
                    readonly success: false
                    readonly error: string
                  }
                | undefined
              >()
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("types ctx.result with the base evidence fields", () => {
      defineRepoContract({
        checks: {
          tests: {
            run: "npm test",
            policy: (ctx) => {
              expectTypeOf(ctx.result.exitCode).toEqualTypeOf<number | null>()
              expectTypeOf(ctx.result.stdout).toEqualTypeOf<string>()
              expectTypeOf(ctx.result.stderr).toEqualTypeOf<string>()
              expectTypeOf(ctx.result.command).toEqualTypeOf<string>()
              expectTypeOf(ctx.result.args).toEqualTypeOf<readonly string[]>()
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("types ctx.evidence as the full run's Evidence, not just the current check's own result", () => {
      defineRepoContract({
        checks: {
          mutation: {
            run: "npm run mutation",
            output: { format: "json" },
            policy: (ctx) => {
              expectTypeOf(ctx.evidence.version).toEqualTypeOf<1>()
              expectTypeOf(ctx.evidence.checks.mutation).not.toBeNever()
              return { outcome: "pass", rationale: "ok" }
            },
          },
        },
        spawn: testSpawn,
        env: testEnv,
      })
    })

    it("keys evidence.checks and verdict.checks by each configured check id", () => {
      const config = defineRepoContract({
        checks: {
          textCheck: { run: "echo hi", output: { format: "text" }, policy: okPolicy },
          jsonCheck: { run: "echo '{}'", output: { format: "json" }, policy: okPolicy },
          noOutputCheck: { run: "echo hi", policy: okPolicy },
        },
        spawn: testSpawn,
        env: testEnv,
      })
      expectTypeOf(config.checks).toHaveProperty("textCheck")
      expectTypeOf(config.checks).toHaveProperty("jsonCheck")
      expectTypeOf(config.checks).toHaveProperty("noOutputCheck")
    })
  })
})
