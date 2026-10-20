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
      { id: "toy:a", version: 3, justification: "", slug: "a" },
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

  describe("a version 2 record", () => {
    const v2 = {
      id: "toy:a",
      version: 2,
      justification: "",
      slug: "a",
      ruleBroken: "r",
      attempted: "a",
      constraint: "c",
      whyPreferable: "w",
      residualRisk: "k",
      revisitWhen: "v",
      expires: "",
    }

    it("is accepted and keeps its version and every structured field", () => {
      const result = validateExceptionRegistry([v2], schema)
      expect(result).toEqual({ ok: true, records: [{ ...v2, version: 2 }] })
    })

    it("accepts a hard expiry date and rejects any other expires value", () => {
      expect(validateExceptionRegistry([{ ...v2, expires: "2027-01-31" }], schema).ok).toBe(true)
      expect(validateExceptionRegistry([{ ...v2, expires: "2028-02-29" }], schema).ok).toBe(true)
      for (const expires of ["soon", "2027-1-3", 5, null, "2027-02-30", "2027-13-01"]) {
        const result = validateExceptionRegistry([{ ...v2, expires }], schema)
        expect(result.ok).toBe(false)
      }
    })

    it("names a structured-field problem even when a core field is also wrong", () => {
      const broken: Record<string, unknown> = { ...v2, id: "not-toy" }
      delete broken.ruleBroken
      const result = validateExceptionRegistry([broken], schema)
      const errors = result.ok ? "" : result.errors.join("\n")
      expect(errors).toContain("ruleBroken")
      expect(errors).toContain("id")
    })

    it("names a structured-field problem and the registry's own problem in the same pass", () => {
      const broken: Record<string, unknown> = { ...v2, slug: "" }
      delete broken.ruleBroken
      const result = validateExceptionRegistry([broken], schema)
      const errors = result.ok ? [] : result.errors.join("\n")
      expect(errors).toContain("ruleBroken")
      expect(errors).toContain("slug must be a non-empty string")
    })

    it("names every structured field that is missing, not only the first", () => {
      const rest: Record<string, unknown> = { ...v2 }
      delete rest.ruleBroken
      delete rest.attempted
      const result = validateExceptionRegistry([rest], schema)
      expect(result.ok ? [] : result.errors.join("\n")).toMatch(/ruleBroken[\s\S]*attempted/)
    })

    it("is the only version allowed to carry the structured fields", () => {
      expect(validateExceptionRegistry([{ ...v2, version: 1 }], schema).ok).toBe(false)
    })
  })
})
