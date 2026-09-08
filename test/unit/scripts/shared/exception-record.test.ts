import { describe, expect, it } from "vitest"
import {
  EXCEPTION_METHODS,
  EXCEPTION_TYPES,
  validateExceptionRegistry,
  validateSecurityExceptionFields,
} from "../../../../scripts/shared/exception-record.js"
import type {
  ExceptionRegistrySchema,
  ExceptionType,
} from "../../../../scripts/shared/exception-record.js"

describe("EXCEPTION_TYPES / EXCEPTION_METHODS", () => {
  it("EXCEPTION_TYPES is exactly the documented, closed set of six members", () => {
    expect(EXCEPTION_TYPES).toEqual([
      "validated-false-positive",
      "accepted-risk",
      "compensating-control",
      "tooling-limitation",
      "scheduled-remediation",
      "platform-or-vendor-constraint",
    ])
  })

  it("EXCEPTION_METHODS is exactly the two recognized substantiation methods", () => {
    expect(EXCEPTION_METHODS).toEqual(["mechanical-reverification", "independent-human-review"])
  })
})

const ALL_TYPES: readonly ExceptionType[] = EXCEPTION_TYPES

describe("validateSecurityExceptionFields", () => {
  const complete = {
    alternatives: "Considered X and Y.",
    remediation: "Tried Z; tracked in #42.",
    method: "independent-human-review",
    exceptionType: "accepted-risk",
  }

  it("accepts an all-empty stub", () => {
    const errors: string[] = []
    const result = validateSecurityExceptionFields(
      { alternatives: "", remediation: "", method: "", exceptionType: "" },
      0,
      ALL_TYPES,
      errors,
    )
    expect(errors).toEqual([])
    expect(result).toEqual({ alternatives: "", remediation: "", method: "", exceptionType: "" })
  })

  it("accepts a complete record", () => {
    const errors: string[] = []
    expect(validateSecurityExceptionFields(complete, 0, ALL_TYPES, errors)).toEqual(complete)
    expect(errors).toEqual([])
  })

  it.each([
    ["a non-string alternatives", { ...complete, alternatives: 3 }],
    ["a bogus method", { ...complete, method: "vibes" }],
    ["a bogus exceptionType", { ...complete, exceptionType: "made-up" }],
  ])("rejects %s", (_desc, raw) => {
    const errors: string[] = []
    expect(validateSecurityExceptionFields(raw, 0, ALL_TYPES, errors)).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  it("enforces validated-false-positive => mechanical-reverification once method is set", () => {
    const errors: string[] = []
    const result = validateSecurityExceptionFields(
      {
        ...complete,
        exceptionType: "validated-false-positive",
        method: "independent-human-review",
      },
      0,
      ALL_TYPES,
      errors,
    )
    expect(result).toBeUndefined()
    expect(errors.join("\n")).toContain("mechanical-reverification")
  })

  it("allows validated-false-positive with method still blank (an incomplete stub)", () => {
    const errors: string[] = []
    const result = validateSecurityExceptionFields(
      { ...complete, exceptionType: "validated-false-positive", method: "" },
      0,
      ALL_TYPES,
      errors,
    )
    expect(errors).toEqual([])
    expect(result?.exceptionType).toBe("validated-false-positive")
  })

  it("respects a narrowed allowed-type set (coderabbit excludes validated-false-positive)", () => {
    const errors: string[] = []
    const narrowed = ALL_TYPES.filter((t) => t !== "validated-false-positive")
    expect(
      validateSecurityExceptionFields(
        { ...complete, exceptionType: "validated-false-positive" },
        0,
        narrowed,
        errors,
      ),
    ).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe("validateExceptionRegistry (generic core)", () => {
  interface ToyRecord {
    readonly id: string
    readonly version: 1
    readonly justification: string
    readonly slug: string
  }
  const schema: ExceptionRegistrySchema<ToyRecord> = {
    namespace: "toy:",
    metadataKeys: ["slug"],
    validateRecord(core, raw, index, errors) {
      const { slug } = raw
      if (typeof slug !== "string" || slug.length === 0) {
        errors.push(`exceptions[${String(index)}].slug must be a non-empty string.`)
        return undefined
      }
      if (core.id !== `toy:${slug}`) {
        errors.push(`exceptions[${String(index)}].id must be toy:<slug>.`)
        return undefined
      }
      return { id: core.id, version: 1, justification: core.justification, slug }
    },
  }

  it("accepts a valid array", () => {
    const r = validateExceptionRegistry(
      [{ id: "toy:a", version: 1, justification: "", slug: "a" }],
      schema,
    )
    expect(r.ok).toBe(true)
  })

  it("rejects a foreign namespace, a bad version, an unknown field, and a duplicate id", () => {
    for (const bad of [
      { id: "other:a", version: 1, justification: "", slug: "a" },
      { id: "toy:a", version: 2, justification: "", slug: "a" },
      { id: "toy:a", version: 1, justification: "", slug: "a", extra: 1 },
    ]) {
      expect(validateExceptionRegistry([bad], schema).ok).toBe(false)
    }
    expect(
      validateExceptionRegistry(
        [
          { id: "toy:a", version: 1, justification: "", slug: "a" },
          { id: "toy:a", version: 1, justification: "", slug: "a" },
        ],
        schema,
      ).ok,
    ).toBe(false)
  })
})
