import { describe, expect, it } from "vitest"
import {
  evaluateExceptionRecord,
  evaluateExceptionRecords,
  hashRequirementFields,
  resolveExceptionPolicy,
  stricterOf,
  validateExceptionPolicyConfig,
} from "../../../src/helpers/exception-policy.js"
import type {
  ExceptionClassification,
  ExceptionPolicy,
  ExceptionPolicyConfig,
} from "../../../src/helpers/exception-policy.js"

const FORBIDDEN: ExceptionPolicy = { mode: "forbidden" }
const ALLOWED: ExceptionPolicy = { mode: "allowed" }
function exception(...requirements: string[]): ExceptionPolicy {
  return { mode: "exception", requirements }
}

describe("stricterOf", () => {
  it("forbidden beats an allowed policy", () => {
    expect(stricterOf(FORBIDDEN, ALLOWED)).toEqual(FORBIDDEN)
  })

  it("forbidden beats an exception policy, regardless of argument order", () => {
    expect(stricterOf(exception("a"), FORBIDDEN)).toEqual(FORBIDDEN)
    expect(stricterOf(FORBIDDEN, exception("a"))).toEqual(FORBIDDEN)
  })

  it("two allowed policies merge to allowed", () => {
    expect(stricterOf(ALLOWED, ALLOWED)).toEqual(ALLOWED)
  })

  it("allowed merged with exception yields the exception's own requirements unchanged", () => {
    expect(stricterOf(ALLOWED, exception("a", "b"))).toEqual(exception("a", "b"))
    expect(stricterOf(exception("a", "b"), ALLOWED)).toEqual(exception("a", "b"))
  })

  it("two exception policies merge to the union of their requirements, preserving a's order first", () => {
    expect(stricterOf(exception("a", "b"), exception("c", "a"))).toEqual(exception("a", "b", "c"))
  })

  it("merging identical requirement sets never duplicates entries", () => {
    expect(stricterOf(exception("a", "b"), exception("a", "b"))).toEqual(exception("a", "b"))
  })
})

describe("resolveExceptionPolicy", () => {
  it("falls back to globalDefault when the classification's group has no entry in config at all", () => {
    const config: ExceptionPolicyConfig = { other: { rules: { x: FORBIDDEN } } }
    const result = resolveExceptionPolicy({ group: "missing", category: "x" }, config, ALLOWED)
    expect(result).toEqual(ALLOWED)
  })

  it("falls back to globalDefault (not an empty reduce) for a blanket category against an unconfigured group", () => {
    const result = resolveExceptionPolicy({ group: "missing", category: "*" }, {}, exception("z"))
    expect(result).toEqual(exception("z"))
  })

  it("an exact rule match takes precedence over a glob pattern", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { "security/*": FORBIDDEN, "security/foo": ALLOWED } },
    }
    const result = resolveExceptionPolicy(
      { group: "g", category: "security/foo" },
      config,
      FORBIDDEN,
    )
    expect(result).toEqual(ALLOWED)
  })

  it("a glob pattern matches a category with no exact entry", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { "security/*": FORBIDDEN } } }
    const result = resolveExceptionPolicy({ group: "g", category: "security/bar" }, config, ALLOWED)
    expect(result).toEqual(FORBIDDEN)
  })

  it("only glob-matching rules contribute to the strictest result -- an unrelated, non-matching rule is never consulted", () => {
    const config: ExceptionPolicyConfig = {
      g: {
        rules: {
          "security/*": exception("a"),
          "unrelated-thing": exception("b"),
        },
      },
    }
    const result = resolveExceptionPolicy({ group: "g", category: "security/x" }, config, ALLOWED)
    expect(result).toEqual(exception("a"))
  })

  it("multiple matching glob patterns resolve to their strictest union", () => {
    const config: ExceptionPolicyConfig = {
      g: {
        rules: {
          "security/*": exception("a"),
          "security/detect-*": exception("b"),
        },
      },
    }
    const result = resolveExceptionPolicy(
      { group: "g", category: "security/detect-object-injection" },
      config,
      ALLOWED,
    )
    expect(result).toEqual(exception("a", "b"))
  })

  it("falls through to the group's own default when no exact or glob match exists", () => {
    const config: ExceptionPolicyConfig = { g: { default: exception("only-default") } }
    const result = resolveExceptionPolicy({ group: "g", category: "unlisted" }, config, ALLOWED)
    expect(result).toEqual(exception("only-default"))
  })

  it("falls through to globalDefault when the group has no default and nothing else matches", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { other: FORBIDDEN } } }
    const result = resolveExceptionPolicy(
      { group: "g", category: "unlisted" },
      config,
      exception("z"),
    )
    expect(result).toEqual(exception("z"))
  })

  it('a blanket "*" category resolves to the strictest policy across every rule plus the group default', () => {
    const config: ExceptionPolicyConfig = {
      g: {
        default: exception("d"),
        rules: { a: exception("x"), b: ALLOWED },
      },
    }
    const result = resolveExceptionPolicy({ group: "g", category: "*" }, config, ALLOWED)
    expect(result).toEqual(exception("x", "d"))
  })

  it('a blanket "*" category is forbidden overall if any one rule (or the default) is forbidden', () => {
    const config: ExceptionPolicyConfig = {
      g: { default: ALLOWED, rules: { a: exception("x"), b: FORBIDDEN } },
    }
    const result = resolveExceptionPolicy({ group: "g", category: "*" }, config, ALLOWED)
    expect(result).toEqual(FORBIDDEN)
  })

  it('a blanket "*" category falls back to globalDefault (not the group default) when the group defines no default of its own', () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: ALLOWED } } }
    const result = resolveExceptionPolicy({ group: "g", category: "*" }, config, exception("z"))
    expect(result).toEqual(exception("z"))
  })

  it('a blanket "*" category is never treated as a literal minimatch glob target -- it does not silently match a "security/*"-style pattern via minimatch semantics', () => {
    // If "*" were run through ordinary minimatch matching (as if it were any other category
    // string), minimatch("security/*", "*") is false (a literal one-segment "*" does not match a
    // multi-segment target) -- but this rule's forbidden status must still be picked up, because
    // the blanket case reduces over every rule directly, never via minimatch at all.
    const config: ExceptionPolicyConfig = { g: { rules: { "security/*": FORBIDDEN } } }
    const result = resolveExceptionPolicy({ group: "g", category: "*" }, config, ALLOWED)
    expect(result).toEqual(FORBIDDEN)
  })
})

describe("validateExceptionPolicyConfig", () => {
  it("returns no errors for a well-formed config", () => {
    const config: ExceptionPolicyConfig = {
      g: { default: ALLOWED, rules: { a: FORBIDDEN, b: exception("x", "y") } },
    }
    expect(validateExceptionPolicyConfig(config)).toEqual([])
  })

  it("rejects a non-object policy value", () => {
    const config = { g: { rules: { a: "not-an-object" } } } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual([`config.g.rules["a"] must be an object.`])
  })

  it('rejects a null policy value (typeof null === "object", but null is not a valid policy)', () => {
    const config = { g: { rules: { a: null } } } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual([`config.g.rules["a"] must be an object.`])
  })

  it("rejects an unrecognized mode", () => {
    const config = { g: { rules: { a: { mode: "not-real" } } } } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors[0]).toContain('mode must be one of "forbidden", "allowed", "exception"')
  })

  it('rejects an "exception" mode with an empty requirements array', () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: exception() } } }
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual([
      `config.g.rules["a"].requirements must be a non-empty array when mode is "exception".`,
    ])
  })

  it('rejects an "exception" mode whose requirements is not an array at all', () => {
    const config = {
      g: { rules: { a: { mode: "exception", requirements: "not-an-array" } } },
    } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual([
      `config.g.rules["a"].requirements must be a non-empty array when mode is "exception".`,
    ])
  })

  it('rejects a literal "*" as a rules key, with the full explanatory message', () => {
    const config: ExceptionPolicyConfig = { g: { rules: { "*": FORBIDDEN } } }
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toContain(
      'config.g.rules must not use the literal "*" as a key -- it would be consulted ' +
        'only as an ordinary minimatch glob (matching the literal one-character category "*", ' +
        "never every category in the group) rather than as the blanket policy " +
        "`resolveExceptionPolicy` already applies whenever the classification's own `category` " +
        'is "*". Omit this key, or use a more specific pattern.',
    )
  })

  it("validates a group's own default the same way as its rules", () => {
    const config = { g: { default: { mode: "bogus" } } } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors[0]).toContain("config.g.default.mode must be one of")
  })

  it("accepts any requirement name when validRequirements is omitted", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: exception("anything-goes") } } }
    expect(validateExceptionPolicyConfig(config)).toEqual([])
  })

  it("rejects a requirement not present in validRequirements when supplied, joining multiple valid names with a comma", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: exception("bogus") } } }
    const errors = validateExceptionPolicyConfig(config, ["justification", "alternatives"])
    expect(errors).toEqual([
      `config.g.rules["a"].requirements contains an invalid entry (got "bogus"); expected one of "justification", "alternatives".`,
    ])
  })

  it("accepts a requirement that is present in validRequirements when supplied", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: exception("justification") } } }
    expect(validateExceptionPolicyConfig(config, ["justification", "alternatives"])).toEqual([])
  })

  it("rejects a non-string requirement entry even when validRequirements is omitted", () => {
    const config = {
      g: { rules: { a: { mode: "exception", requirements: ["justification", 123] } } },
    } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual([
      `config.g.rules["a"].requirements contains a non-string entry (got 123).`,
    ])
  })

  it("rejects a non-string requirement entry when validRequirements is supplied too, without also flagging it as 'not in validRequirements'", () => {
    const config = {
      g: { rules: { a: { mode: "exception", requirements: [null] } } },
    } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config, ["justification"])
    expect(errors).toEqual([
      `config.g.rules["a"].requirements contains a non-string entry (got null).`,
    ])
  })

  it.each([
    ["null", null],
    ["a string", "not-an-object"],
    ["an array", ["default", "rules"]],
  ])("rejects a group whose own entry is %s, not an object", (_label, groupPolicy) => {
    const config = { g: groupPolicy } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual(["config.g must be an object."])
  })

  it.each([
    ["null", null],
    ["a string", "a"],
    ["an array", ["a"]],
  ])("rejects a group whose rules container is %s, not an object", (_label, rules) => {
    const config = { g: { rules } } as unknown as ExceptionPolicyConfig
    const errors = validateExceptionPolicyConfig(config)
    expect(errors).toEqual(["config.g.rules must be an object."])
  })

  it("accepts a group with rules omitted entirely (undefined is not 'rules must be an object')", () => {
    const config: ExceptionPolicyConfig = { g: { default: ALLOWED } }
    expect(validateExceptionPolicyConfig(config)).toEqual([])
  })
})

interface FixtureRecord {
  readonly justification: string
  readonly alternatives: string
  readonly verification?: { readonly verifiedBy: string }
}

function record(overrides: Partial<FixtureRecord> = {}): FixtureRecord {
  return { justification: "", alternatives: "", ...overrides }
}

/** Resolves a possibly-dotted field path (e.g. "verification.verifiedBy") against `FixtureRecord`. */
function fieldValue(rec: FixtureRecord, requirement: string): string {
  const value = requirement
    .split(".")
    .reduce<unknown>(
      (current, segment) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      rec,
    )
  return typeof value === "string" ? value : ""
}

const oneClassification = (
  group: string,
  category: string,
): readonly [ExceptionClassification, ...ExceptionClassification[]] => [{ group, category }]

describe("evaluateExceptionRecord", () => {
  it("returns verdict 'forbidden' with no missing fields when the resolved policy is forbidden", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: FORBIDDEN } } }
    const result = evaluateExceptionRecord({
      record: record(),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(result).toEqual({ record: result.record, verdict: "forbidden", missing: [] })
  })

  it("returns verdict 'permitted' with no missing fields when the resolved policy is allowed", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: ALLOWED } } }
    const result = evaluateExceptionRecord({
      record: record(),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: FORBIDDEN,
      fieldValue,
    })
    expect(result.verdict).toBe("permitted")
    expect(result.missing).toEqual([])
  })

  it("returns verdict 'insufficient' naming exactly the still-empty required fields", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { a: exception("justification", "alternatives") } },
    }
    const result = evaluateExceptionRecord({
      record: record({ justification: "Because." }),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(result.verdict).toBe("insufficient")
    expect(result.missing).toEqual(["alternatives"])
  })

  it("treats a whitespace-only field as still missing", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: exception("justification") } } }
    const result = evaluateExceptionRecord({
      record: record({ justification: "   " }),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(result.verdict).toBe("insufficient")
    expect(result.missing).toEqual(["justification"])
  })

  it("returns verdict 'permitted' once every required field is non-empty", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { a: exception("justification", "alternatives") } },
    }
    const result = evaluateExceptionRecord({
      record: record({ justification: "Because.", alternatives: "Considered X." }),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(result.verdict).toBe("permitted")
    expect(result.missing).toEqual([])
  })

  it("resolves a dotted field path via the caller-supplied fieldValue", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { a: exception("verification.verifiedBy") } },
    }
    const missingVerification = evaluateExceptionRecord({
      record: record(),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(missingVerification.missing).toEqual(["verification.verifiedBy"])

    const withVerification = evaluateExceptionRecord({
      record: record({ verification: { verifiedBy: "alice" } }),
      classifications: oneClassification("g", "a"),
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(withVerification.verdict).toBe("permitted")
  })

  it("evaluates multiple classifications and takes the strictest resolved policy (forbidding one forbids the whole record)", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { a: FORBIDDEN, b: exception("justification") } },
    }
    const result = evaluateExceptionRecord({
      record: record({ justification: "Because." }),
      classifications: [
        { group: "g", category: "a" },
        { group: "g", category: "b" },
      ],
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(result.verdict).toBe("forbidden")
  })

  it("evaluates multiple classifications with different requirements as the union of both", () => {
    const config: ExceptionPolicyConfig = {
      g: { rules: { a: exception("justification"), b: exception("alternatives") } },
    }
    const onlyJustification = evaluateExceptionRecord({
      record: record({ justification: "Because." }),
      classifications: [
        { group: "g", category: "a" },
        { group: "g", category: "b" },
      ],
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(onlyJustification.verdict).toBe("insufficient")
    expect(onlyJustification.missing).toEqual(["alternatives"])

    const both = evaluateExceptionRecord({
      record: record({ justification: "Because.", alternatives: "Considered X." }),
      classifications: [
        { group: "g", category: "a" },
        { group: "g", category: "b" },
      ],
      config,
      globalDefault: ALLOWED,
      fieldValue,
    })
    expect(both.verdict).toBe("permitted")
  })
})

describe("evaluateExceptionRecords", () => {
  it("evaluates each already-matched pair independently, in the same order as its input", () => {
    const config: ExceptionPolicyConfig = { g: { rules: { a: FORBIDDEN, b: ALLOWED } } }
    const recordA = record()
    const recordB = record()

    const results = evaluateExceptionRecords([
      {
        record: recordA,
        classifications: oneClassification("g", "a"),
        config,
        globalDefault: ALLOWED,
        fieldValue,
      },
      {
        record: recordB,
        classifications: oneClassification("g", "b"),
        config,
        globalDefault: ALLOWED,
        fieldValue,
      },
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ record: recordA, verdict: "forbidden", missing: [] })
    expect(results[1]).toEqual({ record: recordB, verdict: "permitted", missing: [] })
  })

  it("returns an empty array for an empty input", () => {
    expect(evaluateExceptionRecords([])).toEqual([])
  })
})

describe("hashRequirementFields", () => {
  it("produces the same hash for the same field values across repeated calls", () => {
    const rec = record({ justification: "Because.", alternatives: "Considered X." })
    const first = hashRequirementFields(rec, ["justification", "alternatives"], fieldValue)
    const second = hashRequirementFields(rec, ["justification", "alternatives"], fieldValue)
    expect(first).toBe(second)
  })

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    const hash = hashRequirementFields(
      record({ justification: "x" }),
      ["justification"],
      fieldValue,
    )
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when any hashed field's value changes", () => {
    const before = hashRequirementFields(
      record({ justification: "Original." }),
      ["justification"],
      fieldValue,
    )
    const after = hashRequirementFields(
      record({ justification: "Edited." }),
      ["justification"],
      fieldValue,
    )
    expect(after).not.toBe(before)
  })

  it("changes when a field not being hashed changes, if that field is added to the hashed set", () => {
    const rec1 = record({ justification: "x", alternatives: "y" })
    const rec2 = record({ justification: "x", alternatives: "z" })
    expect(hashRequirementFields(rec1, ["justification"], fieldValue)).toBe(
      hashRequirementFields(rec2, ["justification"], fieldValue),
    )
    expect(hashRequirementFields(rec1, ["justification", "alternatives"], fieldValue)).not.toBe(
      hashRequirementFields(rec2, ["justification", "alternatives"], fieldValue),
    )
  })

  it("distinguishes field sets whose concatenated values would otherwise collide as plain text", () => {
    const recA = record({ justification: "ab", alternatives: "c" })
    const recB = record({ justification: "a", alternatives: "bc" })
    const hashA = hashRequirementFields(recA, ["justification", "alternatives"], fieldValue)
    const hashB = hashRequirementFields(recB, ["justification", "alternatives"], fieldValue)
    expect(hashA).not.toBe(hashB)
  })
})
