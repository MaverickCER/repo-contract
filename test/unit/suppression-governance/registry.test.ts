import { describe, expect, it } from "vitest"
import type { DisableCommentRecord } from "../../../scripts/suppression-governance/evidence-types.js"
import {
  serializeRegistry,
  sortRecords,
  validateSuppressionRegistry,
} from "../../../scripts/suppression-governance/registry.js"

function record(overrides: Partial<DisableCommentRecord> = {}): DisableCommentRecord {
  return {
    file: "src/example.ts",
    line: 42,
    domain: "eslint",
    rule: ["security/detect-object-injection"],
    content: "eslint-disable-next-line security/detect-object-injection",
    justification: "",
    alternatives: "",
    remediation: "",
    category: "",
    verificationMethod: "",
    reason: "",
    ...overrides,
  }
}

describe("validateSuppressionRegistry", () => {
  it("accepts an empty registry", () => {
    expect(validateSuppressionRegistry([])).toEqual({ ok: true, records: [] })
  })

  it("accepts a well-formed registry, including populated justification fields", () => {
    const valid = [
      record({
        justification: "Tried X.",
        alternatives: "Considered Y.",
        remediation: "Still needed because Z.",
      }),
    ]

    expect(validateSuppressionRegistry(valid)).toEqual({ ok: true, records: valid })
  })

  it("accepts empty justification/alternatives/remediation -- valid registry state, even though policy may still reject it", () => {
    expect(validateSuppressionRegistry([record()])).toEqual({ ok: true, records: [record()] })
  })

  it("rejects a non-array top-level value", () => {
    const result = validateSuppressionRegistry({ not: "an array" })
    expect(result.ok).toBe(false)
  })

  it("rejects a missing/empty file", () => {
    const result = validateSuppressionRegistry([{ ...record(), file: "" }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes(".file"))).toBe(true)
  })

  it("rejects an absolute file path (path-traversal containment)", () => {
    const result = validateSuppressionRegistry([{ ...record(), file: "/etc/passwd" }])
    expect(result.ok).toBe(false)
  })

  it("rejects a file path escaping the repository root via '..' (path-traversal containment)", () => {
    const result = validateSuppressionRegistry([{ ...record(), file: "../outside.ts" }])
    expect(result.ok).toBe(false)
  })

  it("rejects a backslash-separated file path", () => {
    const result = validateSuppressionRegistry([{ ...record(), file: "src\\example.ts" }])
    expect(result.ok).toBe(false)
  })

  it("rejects an invalid line (zero, negative, or non-integer)", () => {
    for (const line of [0, -1, 1.5]) {
      const result = validateSuppressionRegistry([{ ...record(), line }])
      expect(result.ok).toBe(false)
    }
  })

  it("rejects an empty domain", () => {
    const result = validateSuppressionRegistry([{ ...record(), domain: "" }])
    expect(result.ok).toBe(false)
  })

  it("rejects an empty rule list", () => {
    const result = validateSuppressionRegistry([{ ...record(), rule: [] }])
    expect(result.ok).toBe(false)
  })

  it("rejects a rule list containing a non-string or empty entry", () => {
    const result = validateSuppressionRegistry([{ ...record(), rule: [""] }])
    expect(result.ok).toBe(false)
  })

  it("rejects empty content", () => {
    const result = validateSuppressionRegistry([{ ...record(), content: "" }])
    expect(result.ok).toBe(false)
  })

  it("rejects a non-string justification/alternatives/remediation/category/verificationMethod/reason field", () => {
    for (const field of [
      "justification",
      "alternatives",
      "remediation",
      "category",
      "verificationMethod",
      "reason",
    ] as const) {
      const result = validateSuppressionRegistry([{ ...record(), [field]: 42 }])
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.some((e) => e.includes(`.${field}`))).toBe(true)
    }
  })

  it("rejects a missing justification/alternatives/remediation/category/verificationMethod/reason field", () => {
    for (const field of [
      "justification",
      "alternatives",
      "remediation",
      "category",
      "verificationMethod",
      "reason",
    ] as const) {
      const result = validateSuppressionRegistry([{ ...record(), [field]: undefined }])
      expect(result.ok).toBe(false)
    }
  })

  it("accepts every valid member of category, including the '' not-yet-classified sentinel", () => {
    const categories = [
      "",
      "equivalent-mutant",
      "unreachable-invariant",
      "platform-limitation",
      "tooling-limit",
      "rule-not-applicable",
      "intentional-deviation",
    ] as const
    for (const category of categories) {
      const result = validateSuppressionRegistry([record({ category })])
      expect(result.ok).toBe(true)
    }
  })

  it("accepts every valid member of verificationMethod, including the '' not-yet-classified sentinel", () => {
    const verificationMethods = [
      "",
      "mutation-run",
      "existing-test-suite",
      "differential-testing",
      "static-reasoning",
      "untestable",
    ] as const
    for (const verificationMethod of verificationMethods) {
      const result = validateSuppressionRegistry([record({ verificationMethod })])
      expect(result.ok).toBe(true)
    }
  })

  it("rejects a category value that isn't a member of its closed enum, naming the field and listing allowed values", () => {
    const result = validateSuppressionRegistry([{ ...record(), category: "totally-made-up" }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes(".category"))).toBe(true)
      expect(result.errors.some((e) => e.includes("equivalent-mutant"))).toBe(true)
    }
  })

  it("rejects a verificationMethod value that isn't a member of its closed enum", () => {
    const result = validateSuppressionRegistry([
      { ...record(), verificationMethod: "totally-made-up" },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes(".verificationMethod"))).toBe(true)
  })

  it("does not normalize category/verificationMethod -- case, separator, and whitespace variants are all rejected, never coerced", () => {
    for (const category of ["Equivalent-Mutant", "equivalent_mutant", " equivalent-mutant "]) {
      const result = validateSuppressionRegistry([{ ...record(), category }])
      expect(result.ok, `expected ${JSON.stringify(category)} to be rejected`).toBe(false)
    }
  })

  it("rejects duplicate records (same file, line, domain, rule, content)", () => {
    const result = validateSuppressionRegistry([record(), record()])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes("duplicates"))).toBe(true)
  })

  it("does not conflate two different suppressions on different lines as duplicates", () => {
    const result = validateSuppressionRegistry([record({ line: 1 }), record({ line: 2 })])
    expect(result.ok).toBe(true)
  })

  it("still flags two records identical except for category as duplicates -- classification is outside identity", () => {
    const result = validateSuppressionRegistry([
      record({ category: "equivalent-mutant" }),
      record({ category: "unreachable-invariant" }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes("duplicates"))).toBe(true)
  })

  it("fails the whole registry (not just the bad record) when one record is malformed", () => {
    const result = validateSuppressionRegistry([record(), { ...record(), file: "" }])
    expect(result.ok).toBe(false)
  })

  it("rebuilds records as fresh objects, ignoring extraneous keys on the parsed input", () => {
    // `__proto__` via JSON.parse is a real own enumerable key (an object-literal
    // `__proto__:` would instead be the prototype-setter and prove nothing).
    const tampered = {
      ...record(),
      extraneous: "should not survive",
      ...(JSON.parse('{"__proto__":{"evil":true}}') as object),
    }
    const result = validateSuppressionRegistry([tampered])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.records[0] ?? {}).sort()).toEqual(
        [
          "alternatives",
          "category",
          "content",
          "domain",
          "file",
          "justification",
          "line",
          "reason",
          "remediation",
          "rule",
          "verificationMethod",
        ].sort(),
      )
    }
  })
})

describe("sortRecords", () => {
  it("sorts by file, then line, then domain, then rule, then content", () => {
    const unordered = [
      record({ file: "b.ts", line: 1 }),
      record({ file: "a.ts", line: 2 }),
      record({ file: "a.ts", line: 1 }),
    ]

    expect(sortRecords(unordered).map((r) => `${r.file}:${String(r.line)}`)).toEqual([
      "a.ts:1",
      "a.ts:2",
      "b.ts:1",
    ])
  })

  it("is deterministic regardless of input order", () => {
    const a = [record({ file: "b.ts" }), record({ file: "a.ts" })]
    const b = [record({ file: "a.ts" }), record({ file: "b.ts" })]

    expect(sortRecords(a)).toEqual(sortRecords(b))
  })

  it("does not mutate its input", () => {
    const input = [record({ file: "b.ts" }), record({ file: "a.ts" })]
    const copy = [...input]

    sortRecords(input)

    expect(input).toEqual(copy)
  })

  it("ordering is unaffected by category/verificationMethod -- classification never causes on-disk churn", () => {
    const unclassified = [record({ file: "a.ts", line: 1 }), record({ file: "b.ts", line: 1 })]
    const classified = [
      record({
        file: "a.ts",
        line: 1,
        category: "equivalent-mutant",
        verificationMethod: "mutation-run",
      }),
      record({
        file: "b.ts",
        line: 1,
        category: "tooling-limit",
        verificationMethod: "untestable",
      }),
    ]

    const orderOf = (records: readonly ReturnType<typeof record>[]): readonly string[] =>
      sortRecords(records).map((r) => `${r.file}:${String(r.line)}`)

    expect(orderOf(classified)).toEqual(orderOf(unclassified))
  })
})

describe("serializeRegistry", () => {
  it("produces deterministic, pretty-printed JSON with a trailing newline", () => {
    const serialized = serializeRegistry([record()])

    expect(serialized.endsWith("\n")).toBe(true)
    expect(JSON.parse(serialized)).toEqual([record()])
    expect(serialized).toBe(serializeRegistry([record()]))
  })
})
