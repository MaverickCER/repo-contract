import { describe, expect, it } from "vitest"
import { validateRepoContractConfig } from "../../../src/config/validate-config.js"
import {
  DependencyDeclaredLaterError,
  InvalidCheckConfigError,
  InvalidRepoContractConfigError,
} from "../../../src/errors.js"
import type { PolicyResult, RepoContractConfig } from "../../../src/types.js"

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

/** Casts a deliberately-malformed plain object into `RepoContractConfig` for a validation test -- `validateRepoContractConfig` exists precisely to catch shapes the type system alone can't rule out (plain JS callers, widened/cast values). */
function malformed(value: unknown): RepoContractConfig {
  return value as RepoContractConfig
}

describe("validateRepoContractConfig", () => {
  it("accepts a config with zero checks", () => {
    expect(() => {
      validateRepoContractConfig({ checks: {} })
    }).not.toThrow()
  })

  it("accepts a config with one check", () => {
    expect(() => {
      validateRepoContractConfig({ checks: { tests: { run: "npm test", policy: okPolicy } } })
    }).not.toThrow()
  })

  it("accepts a config with many checks", () => {
    expect(() => {
      validateRepoContractConfig({
        checks: {
          a: { run: "echo a", policy: okPolicy },
          b: { run: ["echo", "b"], policy: okPolicy },
          c: { run: "echo c", shell: true, policy: okPolicy },
        },
      })
    }).not.toThrow()
  })

  it("accepts a positive integer concurrency", () => {
    expect(() => {
      validateRepoContractConfig({ checks: {}, concurrency: 4 })
    }).not.toThrow()
  })

  it.each([0, -1, 1.5, Number.NaN, "4"])("rejects an invalid concurrency: %s", (concurrency) => {
    expect(() => {
      validateRepoContractConfig(malformed({ checks: {}, concurrency }))
    }).toThrow(/concurrency must be a positive integer/)
  })

  it("rejects a null config", () => {
    expect(() => {
      validateRepoContractConfig(malformed(null))
    }).toThrow(/config must be an object/)
  })

  it("rejects a non-null, non-object config with the config-level message, not the checks-level one", () => {
    expect(() => {
      validateRepoContractConfig(malformed(5))
    }).toThrow(/config must be an object/)
  })

  it("rejects a config missing checks", () => {
    expect(() => {
      validateRepoContractConfig(malformed({}))
    }).toThrow(/checks must be an object/)
  })

  it("rejects checks that is an array", () => {
    expect(() => {
      validateRepoContractConfig(malformed({ checks: [] }))
    }).toThrow(/checks must be an object/)
  })

  function configWith(check: unknown): RepoContractConfig {
    return malformed({ checks: { x: check } })
  }

  it("rejects a check definition that is not an object", () => {
    expect(() => {
      validateRepoContractConfig(configWith(5))
    }).toThrow(/check definition must be an object/)
    expect(() => {
      validateRepoContractConfig(configWith(null))
    }).toThrow(/check definition must be an object/)
  })

  it("rejects shell: true with an empty run string", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "   ", shell: true, policy: okPolicy }))
    }).toThrow(/run string is empty or contains only whitespace/)
  })

  it("accepts a fully valid env object with multiple string values", () => {
    expect(() => {
      validateRepoContractConfig(
        configWith({ run: "echo a", env: { A: "1", B: "2" }, policy: okPolicy }),
      )
    }).not.toThrow()
  })

  it("rejects a check with a missing run", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ policy: okPolicy }))
    }).toThrow(/run must be a string or an array of strings/)
  })

  it("rejects a check with a numeric run", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: 5, policy: okPolicy }))
    }).toThrow(/run must be a string or an array of strings/)
  })

  it("rejects a check with an empty run array", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: [], policy: okPolicy }))
    }).toThrow(/run array must not be empty/)
  })

  it("rejects a string run whose first token (the executable) is empty -- run: \"''\"", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "''", policy: okPolicy }))
    }).toThrow(/first token .* is empty or contains only whitespace/)
    expect(() => {
      validateRepoContractConfig(configWith({ run: "'  ' build", policy: okPolicy }))
    }).toThrow(/first token .* is empty or contains only whitespace/)
  })

  it("rejects an array run whose first element (the executable) is empty", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: ["", "--flag"], policy: okPolicy }))
    }).toThrow(/first element .* is empty or contains only whitespace/)
  })

  it("rejects an array run whose first element (the executable) is whitespace only", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: ["   ", "--flag"], policy: okPolicy }))
    }).toThrow(/first element .* is empty or contains only whitespace/)
  })

  it("rejects a check with a non-string element in the run array", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: ["echo", 5], policy: okPolicy }))
    }).toThrow(/run array must contain only strings/)
  })

  it("rejects a check whose run string contains an unquoted shell operator without shell: true", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a && echo b", policy: okPolicy }))
    }).toThrow(/shell operator/)
  })

  it("accepts a run string containing a shell operator when shell: true", () => {
    expect(() => {
      validateRepoContractConfig(
        configWith({ run: "echo a && echo b", shell: true, policy: okPolicy }),
      )
    }).not.toThrow()
  })

  it("rejects shell: true combined with array-form run, with the full explanatory message", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: ["echo", "a"], shell: true, policy: okPolicy }))
    }).toThrow(
      "shell: true requires run to be a string -- an array of arguments is individually " +
        "escaped for the shell and cannot express shell operators like pipes or redirects, " +
        "so combining the two forms would silently do nothing useful.",
    )
  })

  it("rejects a non-boolean shell", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", shell: "yes", policy: okPolicy }))
    }).toThrow(/shell must be a boolean/)
  })

  it("rejects a non-string cwd", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", cwd: 5, policy: okPolicy }))
    }).toThrow(/cwd must be a string/)
  })

  it("accepts a string cwd", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", cwd: "/tmp", policy: okPolicy }))
    }).not.toThrow()
  })

  it("rejects a non-object env", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", env: "x", policy: okPolicy }))
    }).toThrow(/env must be an object mapping name to value/)
  })

  it("rejects a null env", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", env: null, policy: okPolicy }))
    }).toThrow(/env must be an object mapping name to value/)
  })

  it("rejects a non-string value inside env", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", env: { X: 5 }, policy: okPolicy }))
    }).toThrow(/env\["X"\] must be a string/)
  })

  it("rejects a non-boolean inheritEnv", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", inheritEnv: "yes", policy: okPolicy }))
    }).toThrow(/inheritEnv must be a boolean/)
  })

  it.each([true, false])("accepts a boolean inheritEnv: %s", (inheritEnv) => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", inheritEnv, policy: okPolicy }))
    }).not.toThrow()
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid timeoutMs: %s",
    (timeoutMs) => {
      expect(() => {
        validateRepoContractConfig(configWith({ run: "echo a", timeoutMs, policy: okPolicy }))
      }).toThrow(/timeoutMs must be a positive number/)
    },
  )

  it("accepts a positive finite timeoutMs", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", timeoutMs: 5000, policy: okPolicy }))
    }).not.toThrow()
  })

  it("rejects a non-object output", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", output: "json", policy: okPolicy }))
    }).toThrow(/output must be an object/)
  })

  it("rejects a null output", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", output: null, policy: okPolicy }))
    }).toThrow(/output must be an object/)
  })

  it("rejects an unrecognized output.format, listing every allowed format in the message", () => {
    expect(() => {
      validateRepoContractConfig(
        configWith({ run: "echo a", output: { format: "xml" }, policy: okPolicy }),
      )
    }).toThrow('output.format must be one of "json", "yaml", "text".')
  })

  it.each(["json", "yaml", "text"] as const)("accepts output.format: %s", (format) => {
    expect(() => {
      validateRepoContractConfig(
        configWith({ run: "echo a", output: { format }, policy: okPolicy }),
      )
    }).not.toThrow()
  })

  it("accepts a check with no dependsOn", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", policy: okPolicy }))
    }).not.toThrow()
  })

  it("accepts a check depending on an existing sibling check", () => {
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", policy: okPolicy },
            b: { run: "echo b", dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("accepts a valid diamond dependency shape", () => {
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", policy: okPolicy },
            b: { run: "echo b", dependsOn: ["a"], policy: okPolicy },
            c: { run: "echo c", dependsOn: ["a"], policy: okPolicy },
            d: { run: "echo d", dependsOn: ["b", "c"], policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("rejects a non-array dependsOn", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", dependsOn: "b", policy: okPolicy }))
    }).toThrow(/dependsOn must be an array of check ids/)
  })

  it("rejects a dependsOn array containing a non-string element", () => {
    expect(() => {
      validateRepoContractConfig(
        configWith({ run: "echo a", dependsOn: ["b", 5], policy: okPolicy }),
      )
    }).toThrow(/dependsOn must be an array of check ids/)
  })

  it("rejects a check that depends on its own id", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", dependsOn: ["x"], policy: okPolicy }))
    }).toThrow(/dependsOn must not include the check's own id/)
  })

  it("rejects a dependency on an unknown check id, naming the offending checkId and the unknown id", () => {
    try {
      validateRepoContractConfig(
        malformed({
          checks: { a: { run: "echo a", dependsOn: ["does-not-exist"], policy: okPolicy } },
        }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCheckConfigError)
      const typed = error as InvalidCheckConfigError
      expect(typed.checkId).toBe("a")
      expect(typed.message).toContain('unknown check id "does-not-exist"')
    }
  })

  it("rejects a 2-node mutual dependsOn as a forward reference on the first check declared", () => {
    // A former "cycle" is no longer expressible at all: declaration order is the required
    // topological order, so whichever of "a"/"b" is declared first already has a forward
    // reference the moment it names the other -- there's no cycle left to trace once every edge
    // must point backward (see DependencyDeclaredLaterError, ADR 0002).
    try {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", dependsOn: ["b"], policy: okPolicy },
            b: { run: "echo b", dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyDeclaredLaterError)
      const typed = error as DependencyDeclaredLaterError
      expect(typed.checkId).toBe("a")
      expect(typed.dependencyId).toBe("b")
    }
  })

  it("rejects a longer dependency chain the same way, on the first forward reference reached", () => {
    try {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", dependsOn: ["b"], policy: okPolicy },
            b: { run: "echo b", dependsOn: ["c"], policy: okPolicy },
            c: { run: "echo c", dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyDeclaredLaterError)
      const typed = error as DependencyDeclaredLaterError
      expect(typed.checkId).toBe("a")
      expect(typed.dependencyId).toBe("b")
    }
  })

  it("names exactly the violating check and dependency id, not an unrelated valid check", () => {
    try {
      validateRepoContractConfig(
        malformed({
          checks: {
            valid: { run: "echo valid", policy: okPolicy },
            a: { run: "echo a", dependsOn: ["b"], policy: okPolicy },
            b: { run: "echo b", policy: okPolicy },
          },
        }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyDeclaredLaterError)
      const typed = error as DependencyDeclaredLaterError
      expect(typed.checkId).toBe("a")
      expect(typed.dependencyId).toBe("b")
    }
  })

  it("accepts a check with isolated: true", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", isolated: true, policy: okPolicy }))
    }).not.toThrow()
  })

  it("accepts a check with isolated: false", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", isolated: false, policy: okPolicy }))
    }).not.toThrow()
  })

  it("rejects a non-boolean isolated value", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", isolated: "true", policy: okPolicy }))
    }).toThrow(/isolated must be a boolean/)
  })

  it("accepts an isolated check with an explicit dependsOn on it from a later-declared check -- no conflict is possible under the positional model", () => {
    // Under the old, position-independent model, isolated "a"'s implicit dependency on every
    // other check could conflict with "b"'s explicit dependsOn: ["a"] (a real mutual cycle). Under
    // the new positional model, isolated "a" (declared first) only implicitly depends on checks
    // declared *before* it -- none here -- so there is no implicit edge for "b"'s real, backward
    // dependsOn to conflict with. See ADR 0002.
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", isolated: true, policy: okPolicy },
            b: { run: "echo b", dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("accepts an isolated check alongside unrelated sibling checks with no dependsOn at all", () => {
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", policy: okPolicy },
            b: { run: "echo b", policy: okPolicy },
            c: { run: "echo c", isolated: true, policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("accepts two isolated checks in the same run -- their implicit 'everyone else' edges must not fold into a false cycle with each other", () => {
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", isolated: true, policy: okPolicy },
            b: { run: "echo b", isolated: true, policy: okPolicy },
            c: { run: "echo c", policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("accepts an isolated check with an explicit dependsOn on another isolated check", () => {
    expect(() => {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", isolated: true, policy: okPolicy },
            b: { run: "echo b", isolated: true, dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
    }).not.toThrow()
  })

  it("still rejects a genuine mutual dependsOn between two isolated checks, as a forward reference", () => {
    try {
      validateRepoContractConfig(
        malformed({
          checks: {
            a: { run: "echo a", isolated: true, dependsOn: ["b"], policy: okPolicy },
            b: { run: "echo b", isolated: true, dependsOn: ["a"], policy: okPolicy },
          },
        }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyDeclaredLaterError)
      const typed = error as DependencyDeclaredLaterError
      expect(typed.checkId).toBe("a")
      expect(typed.dependencyId).toBe("b")
    }
  })

  it("rejects a check with a missing policy", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a" }))
    }).toThrow(/policy must be a function/)
  })

  it("rejects a check whose policy is not a function", () => {
    expect(() => {
      validateRepoContractConfig(configWith({ run: "echo a", policy: "true" }))
    }).toThrow(/policy must be a function/)
  })

  it("includes the offending checkId in the thrown error, prefixed identically to InvalidCheckConfigError's own message format", () => {
    try {
      validateRepoContractConfig(
        malformed({ checks: { "my-check": { run: 5, policy: okPolicy } } }),
      )
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCheckConfigError)
      const typed = error as InvalidCheckConfigError
      expect(typed.checkId).toBe("my-check")
      expect(typed.message).toBe(
        'Invalid check config for "my-check" -- run must be a string or an array of strings.',
      )
    }
  })

  it("InvalidRepoContractConfigError's message is exactly config-prefixed plus the reason", () => {
    try {
      validateRepoContractConfig(malformed(null))
      expect.unreachable("expected validateRepoContractConfig to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRepoContractConfigError)
      expect((error as Error).message).toBe(
        "Invalid repo-contract config -- config must be an object.",
      )
    }
  })
})
