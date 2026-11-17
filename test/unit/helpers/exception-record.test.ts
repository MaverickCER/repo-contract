import { describe, expect, it } from "vitest"
import {
  asFlatExceptionRecords,
  emptyV2Fields,
  evaluateFindingVerdict,
  EXCEPTION_METHODS,
  EXCEPTION_TYPES,
  EXCEPTION_V2_FIELD_KEYS,
  exceptionRegistryStandardSchema,
  isExpired,
  isLegacyRecord,
  isValidNonEmptyStringField,
  LEGACY_FIELD_VALUE,
  recordFieldValue,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateExceptionRegistry,
  validateSecurityExceptionFields,
} from "../../../src/helpers/index.js"
import type {
  ExceptionPolicyConfig,
  ExceptionRegistrySchema,
  ExceptionType,
} from "../../../src/helpers/index.js"

interface ToyRecord {
  readonly id: string
  readonly version: 1 | 2
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
    return { id: core.id, version: 1, justification: core.justification, slug }
  },
}

const v1 = { id: "toy:a", version: 1, justification: "", slug: "a" }
const v2 = {
  ...v1,
  version: 2,
  ruleBroken: "r",
  attempted: "a",
  constraint: "c",
  whyPreferable: "w",
  residualRisk: "k",
  revisitWhen: "v",
  expires: "",
}

function errorsOf(value: unknown): string {
  const result = validateExceptionRegistry(value, schema)
  return result.ok ? "" : result.errors.join("\n")
}

describe("the vocabulary", () => {
  it("EXCEPTION_TYPES holds the eight types, required-for-package-to-exist and dev-only-not-shipped included", () => {
    expect(EXCEPTION_TYPES).toEqual([
      "validated-false-positive",
      "accepted-risk",
      "compensating-control",
      "tooling-limitation",
      "scheduled-remediation",
      "platform-or-vendor-constraint",
      "required-for-package-to-exist",
      "dev-only-not-shipped",
    ])
  })

  it("EXCEPTION_METHODS holds mechanical-reverification, independent-human-review and policy-rule", () => {
    expect(EXCEPTION_METHODS).toEqual([
      "mechanical-reverification",
      "independent-human-review",
      "policy-rule",
    ])
  })

  it("names the six v2 text fields and the four security fields in canonical order", () => {
    expect(EXCEPTION_V2_FIELD_KEYS).toEqual([
      "ruleBroken",
      "attempted",
      "constraint",
      "whyPreferable",
      "residualRisk",
      "revisitWhen",
    ])
    expect(SECURITY_EXCEPTION_FIELD_KEYS).toEqual([
      "alternatives",
      "remediation",
      "method",
      "exceptionType",
    ])
    expect(LEGACY_FIELD_VALUE).toBe("(legacy version 1 record)")
  })
})

describe("emptyV2Fields, isLegacyRecord, isExpired", () => {
  it("emptyV2Fields returns every v2 field blank", () => {
    expect(emptyV2Fields()).toEqual({
      ruleBroken: "",
      attempted: "",
      constraint: "",
      whyPreferable: "",
      residualRisk: "",
      revisitWhen: "",
      expires: "",
    })
  })

  it("emptyV2Fields returns a fresh object each call", () => {
    expect(emptyV2Fields()).not.toBe(emptyV2Fields())
  })

  it("isLegacyRecord is true only for version 1", () => {
    expect(isLegacyRecord({ version: 1 })).toBe(true)
    expect(isLegacyRecord({ version: 2 })).toBe(false)
  })

  const now = new Date("2026-11-16T12:00:00Z")

  it("isExpired is false for an empty expires and for today", () => {
    expect(isExpired("", now)).toBe(false)
    expect(isExpired("2026-11-16", now)).toBe(false)
    expect(isExpired("2026-11-17", now)).toBe(false)
  })

  it("isExpired is true for a date strictly before now", () => {
    expect(isExpired("2026-11-15", now)).toBe(true)
    expect(isExpired("2025-12-31", now)).toBe(true)
  })

  it("isExpired is false for an invalid date", () => {
    for (const expires of ["soon", "2026-1-01", "2026-02-30", "x2026-01-01", "2026-01-01x"]) {
      expect(isExpired(expires, now)).toBe(false)
    }
  })

  it("isExpired is false for a value that is not a string, even one that prints as a date", () => {
    for (const expires of [["2020-01-01"], 20200101, null, undefined, {}]) {
      expect(isExpired(expires, now)).toBe(false)
    }
  })

  it("isExpired defaults to the current clock", () => {
    expect(isExpired("2000-01-01")).toBe(true)
    expect(isExpired("2999-01-01")).toBe(false)
  })
})

describe("validateExceptionRegistry", () => {
  it("accepts a valid version 1 record and rebuilds it", () => {
    expect(validateExceptionRegistry([v1], schema)).toEqual({ ok: true, records: [v1] })
  })

  it("accepts an empty array", () => {
    expect(validateExceptionRegistry([], schema)).toEqual({ ok: true, records: [] })
  })

  it("validateExceptionRegistry rejects a non-array", () => {
    for (const value of [undefined, null, {}, "[]"]) {
      expect(validateExceptionRegistry(value, schema)).toEqual({
        ok: false,
        errors: ['An exception registry\'s "exceptions" must be a JSON array of records.'],
      })
    }
  })

  it("rejects an element that is not an object", () => {
    for (const entry of [null, "toy:a", [], 3]) {
      expect(errorsOf([entry])).toBe("exceptions[0] must be an object.")
    }
  })

  it("validateExceptionRegistry rejects an id outside the namespace", () => {
    expect(errorsOf([{ ...v1, id: "other:a" }])).toBe(
      'exceptions[0].id must be a non-empty string beginning with "toy:" (got "other:a").',
    )
    expect(errorsOf([{ ...v1, id: "toy:" }])).toContain('(got "toy:")')
    expect(errorsOf([{ ...v1, id: 3 }])).toContain("(got 3)")
  })

  it("validateExceptionRegistry rejects an unknown key and names the permitted ones", () => {
    expect(errorsOf([{ ...v1, extra: 1, other: 2 }])).toBe(
      'exceptions[0] has unrecognized field(s) "extra", "other": only "id", "version", "justification", "slug" are permitted.',
    )
  })

  it("permits the v2 keys only on a version 2 record", () => {
    expect(errorsOf([{ ...v2, version: 1 }])).toContain('"ruleBroken"')
    expect(errorsOf([{ ...v2, version: 1 }])).toContain("unrecognized")
  })

  it("validateExceptionRegistry rejects a duplicate id", () => {
    expect(errorsOf([v1, { ...v1, slug: "b" }])).toBe(
      'exceptions[1] reuses the id "toy:a" already held by exceptions[0].',
    )
  })

  it("validateExceptionRegistry rejects a version other than 1 or 2", () => {
    for (const version of [0, 3, "2", undefined]) {
      expect(errorsOf([{ ...v1, version }])).toBe(
        `exceptions[0].version must be the number 2 (or the legacy 1) (got ${JSON.stringify(version)}).`,
      )
    }
  })

  it("rejects a justification that is not a string", () => {
    expect(errorsOf([{ ...v1, justification: 1 }])).toBe(
      "exceptions[0].justification must be a string.",
    )
  })

  it("accepts a version 2 record and keeps its version and every v2 field", () => {
    expect(validateExceptionRegistry([v2], schema)).toEqual({ ok: true, records: [v2] })
  })

  it("validateExceptionRegistry requires every v2 field and expires on a version 2 record", () => {
    for (const key of [...EXCEPTION_V2_FIELD_KEYS]) {
      const broken = Object.fromEntries(Object.entries(v2).filter(([name]) => name !== key))
      expect(errorsOf([broken])).toBe(
        `exceptions[0].${key} must be a string (a version 2 record carries it).`,
      )
    }
    const noExpiry: Record<string, unknown> = { ...v2 }
    delete noExpiry.expires
    expect(errorsOf([noExpiry])).toBe(
      'exceptions[0].expires must be "" or a YYYY-MM-DD date (got undefined).',
    )
  })

  it("accepts a calendar expiry date", () => {
    expect(validateExceptionRegistry([{ ...v2, expires: "2027-01-31" }], schema).ok).toBe(true)
    expect(validateExceptionRegistry([{ ...v2, expires: "2028-02-29" }], schema).ok).toBe(true)
  })

  it("validateExceptionRegistry rejects expires 2027-02-30", () => {
    for (const expires of ["2027-02-30", "2027-13-01", "2027-1-3", "soon", 5, null]) {
      expect(errorsOf([{ ...v2, expires }])).toBe(
        `exceptions[0].expires must be "" or a YYYY-MM-DD date (got ${JSON.stringify(expires)}).`,
      )
    }
  })

  it("validateExceptionRegistry reports every problem in one pass", () => {
    const broken: Record<string, unknown> = { ...v2, id: "not-toy" }
    delete broken.ruleBroken
    delete broken.attempted
    const errors = errorsOf([broken, { ...v1, id: "toy:b", version: 7 }])
    expect(errors).toMatch(/exceptions\[0\]\.id[\s\S]*ruleBroken[\s\S]*attempted/)
    expect(errors).toContain("exceptions[1].version")
  })

  it("names a v2 problem and the registry's own problem in the same pass", () => {
    const broken: Record<string, unknown> = { ...v2, slug: "" }
    delete broken.ruleBroken
    const errors = errorsOf([broken])
    expect(errors).toContain("ruleBroken")
    expect(errors).toContain("slug must be a non-empty string")
  })

  it("drops a v2 record whose own fields pass but whose v2 fields fail", () => {
    const broken: Record<string, unknown> = { ...v2 }
    delete broken.ruleBroken
    expect(validateExceptionRegistry([broken], schema).ok).toBe(false)
  })

  // A record that fails is never kept, so a later record with its id is not called a duplicate.
  it("keeps no record whose v2 field is not a string", () => {
    expect(errorsOf([{ ...v2, ruleBroken: 3 }, v2])).toBe(
      "exceptions[0].ruleBroken must be a string (a version 2 record carries it).",
    )
  })

  it("keeps no record whose expires is not a date", () => {
    expect(errorsOf([{ ...v2, expires: "soon" }, v2])).toBe(
      'exceptions[0].expires must be "" or a YYYY-MM-DD date (got "soon").',
    )
  })

  it("keeps no record with an unknown key", () => {
    const errors = errorsOf([{ ...v1, extra: 1 }, v1]).split("\n")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^exceptions\[0\] has unrecognized field\(s\) "extra"/)
  })

  it("keeps no version 2 record the registry's own validator rejects", () => {
    expect(
      errorsOf([
        { ...v2, slug: "" },
        { ...v2, id: "toy:b", slug: "" },
      ]),
    ).toBe(
      [
        "exceptions[0].slug must be a non-empty string.",
        "exceptions[1].slug must be a non-empty string.",
      ].join("\n"),
    )
  })

  it("validateExceptionRegistry accepts a blank stub", () => {
    const stub = { ...v1, version: 2, ...emptyV2Fields() }
    expect(validateExceptionRegistry([stub], schema)).toEqual({ ok: true, records: [stub] })
  })

  it("passes the validator version 1 for the core, so a v1-only validator still works", () => {
    const seen: number[] = []
    const spy: ExceptionRegistrySchema<ToyRecord> = {
      ...schema,
      validateRecord(core, raw, index, errors) {
        seen.push(core.version)
        return schema.validateRecord(core, raw, index, errors)
      },
    }
    validateExceptionRegistry([v2], spy)
    expect(seen).toEqual([1])
  })
})

describe("exceptionRegistryStandardSchema", () => {
  it("exceptionRegistryStandardSchema returns value on success and issues on failure", async () => {
    const standard = exceptionRegistryStandardSchema(schema)
    expect(standard["~standard"].version).toBe(1)
    expect(standard["~standard"].vendor).toBe("repo-contract")
    expect(await standard["~standard"].validate([v1])).toEqual({ value: [v1] })
    expect(await standard["~standard"].validate([{ ...v1, version: 9 }])).toEqual({
      issues: [
        { message: "exceptions[0].version must be the number 2 (or the legacy 1) (got 9)." },
      ],
    })
  })
})

describe("validateSecurityExceptionFields", () => {
  const all: readonly ExceptionType[] = EXCEPTION_TYPES
  const complete = {
    alternatives: "Considered X and Y.",
    remediation: "Tracked in #42.",
    method: "independent-human-review",
    exceptionType: "accepted-risk",
  }

  it("accepts an all-empty stub", () => {
    const errors: string[] = []
    const blank = { alternatives: "", remediation: "", method: "", exceptionType: "" }
    expect(validateSecurityExceptionFields(blank, 0, all, errors)).toEqual(blank)
    expect(errors).toEqual([])
  })

  it("accepts a complete record and every method", () => {
    for (const method of EXCEPTION_METHODS) {
      const errors: string[] = []
      expect(validateSecurityExceptionFields({ ...complete, method }, 0, all, errors)).toEqual({
        ...complete,
        method,
      })
      expect(errors).toEqual([])
    }
  })

  it.each([
    [
      "alternatives",
      { ...complete, alternatives: 3 },
      "exceptions[2].alternatives must be a string.",
    ],
    [
      "remediation",
      { ...complete, remediation: null },
      "exceptions[2].remediation must be a string.",
    ],
    [
      "method",
      { ...complete, method: "vibes" },
      'exceptions[2].method must be "" or one of "mechanical-reverification", "independent-human-review", "policy-rule" (got "vibes").',
    ],
    [
      "method that is not a string",
      { ...complete, method: 1 },
      'exceptions[2].method must be "" or one of "mechanical-reverification", "independent-human-review", "policy-rule" (got 1).',
    ],
    ["exceptionType that is not a string", { ...complete, exceptionType: 1 }, "(got 1)."],
  ])("rejects a bad %s", (_label, raw, message) => {
    const errors: string[] = []
    expect(validateSecurityExceptionFields(raw, 2, all, errors)).toBeUndefined()
    expect(errors.join("\n")).toContain(message)
  })

  it("validateSecurityExceptionFields rejects validated-false-positive with independent-human-review", () => {
    const errors: string[] = []
    const raw = { ...complete, exceptionType: "validated-false-positive" }
    expect(validateSecurityExceptionFields(raw, 0, all, errors)).toBeUndefined()
    expect(errors).toEqual([
      'exceptions[0]: exceptionType "validated-false-positive" requires method "mechanical-reverification" (a false-positive claim rests on a re-run, not opinion); got method "independent-human-review".',
    ])
  })

  it("accepts validated-false-positive with mechanical-reverification or a blank method", () => {
    for (const method of ["mechanical-reverification", ""]) {
      const errors: string[] = []
      const raw = { ...complete, exceptionType: "validated-false-positive", method }
      expect(validateSecurityExceptionFields(raw, 0, all, errors)).toEqual(raw)
      expect(errors).toEqual([])
    }
  })

  it("validateSecurityExceptionFields rejects a type outside the allowed list", () => {
    const errors: string[] = []
    const raw = { ...complete, exceptionType: "accepted-risk" }
    expect(
      validateSecurityExceptionFields(
        raw,
        0,
        ["dev-only-not-shipped", "tooling-limitation"],
        errors,
      ),
    ).toBeUndefined()
    expect(errors).toEqual([
      'exceptions[0].exceptionType must be "" or one of "dev-only-not-shipped", "tooling-limitation" (got "accepted-risk").',
    ])
  })

  it("reports every bad field at once", () => {
    const errors: string[] = []
    validateSecurityExceptionFields({}, 0, all, errors)
    expect(errors).toHaveLength(4)
  })
})

describe("isValidNonEmptyStringField", () => {
  it("isValidNonEmptyStringField pushes a message for an empty string", () => {
    const errors: string[] = []
    expect(isValidNonEmptyStringField("", "exceptions[0].package", errors)).toBe(false)
    expect(isValidNonEmptyStringField(4, "exceptions[1].package", errors)).toBe(false)
    expect(errors).toEqual([
      "exceptions[0].package must be a non-empty string.",
      "exceptions[1].package must be a non-empty string.",
    ])
  })

  it("rejects a non-string that has a length, such as an array", () => {
    const errors: string[] = []
    expect(isValidNonEmptyStringField(["tar"], "x", errors)).toBe(false)
    expect(errors).toEqual(["x must be a non-empty string."])
  })

  it("accepts a non-empty string silently", () => {
    const errors: string[] = []
    expect(isValidNonEmptyStringField("tar", "x", errors)).toBe(true)
    expect(errors).toEqual([])
  })
})

describe("recordFieldValue", () => {
  it("returns a field's text", () => {
    expect(recordFieldValue({ version: 2, ruleBroken: "r" }, "ruleBroken")).toBe("r")
    expect(recordFieldValue({ version: 1, justification: "j" }, "justification")).toBe("j")
  })

  it("recordFieldValue answers LEGACY_FIELD_VALUE for a v2 field of a version 1 record", () => {
    for (const key of EXCEPTION_V2_FIELD_KEYS) {
      expect(recordFieldValue({ version: 1 }, key)).toBe(LEGACY_FIELD_VALUE)
    }
  })

  it("recordFieldValue answers empty for a missing field of a version 2 record", () => {
    expect(recordFieldValue({ version: 2 }, "ruleBroken")).toBe("")
  })

  it("answers empty for a missing non-v2 field of a version 1 record, and for a non-string", () => {
    expect(recordFieldValue({ version: 1 }, "alternatives")).toBe("")
    expect(recordFieldValue({ version: 1, justification: 3 }, "justification")).toBe("")
    expect(recordFieldValue(undefined, "ruleBroken")).toBe("")
    expect(recordFieldValue("text", "length")).toBe("")
  })
})

describe("asFlatExceptionRecords", () => {
  it("returns the same array", () => {
    const records = [{ id: "toy:a" }]
    expect(asFlatExceptionRecords(records)).toBe(records)
  })
})

describe("evaluateFindingVerdict", () => {
  const config: ExceptionPolicyConfig = {
    toy: {
      default: { mode: "exception", requirements: ["justification", "ruleBroken"] },
      rules: { critical: { mode: "forbidden" } },
    },
  }
  const fallback = { mode: "exception", requirements: ["justification"] } as const

  it("evaluateFindingVerdict returns unmatched for an undefined record", () => {
    expect(
      evaluateFindingVerdict(undefined, [{ group: "toy", category: "low" }], config, fallback),
    ).toEqual({ verdict: "unmatched", missing: [] })
  })

  it("permits a complete record and names what an incomplete one misses", () => {
    const low = [{ group: "toy", category: "low" }] as const
    expect(
      evaluateFindingVerdict(
        { version: 2, justification: "j", ruleBroken: "r" },
        low,
        config,
        fallback,
      ),
    ).toEqual({ verdict: "permitted", missing: [] })
    expect(
      evaluateFindingVerdict(
        { version: 2, justification: " ", ruleBroken: "" },
        low,
        config,
        fallback,
      ),
    ).toEqual({ verdict: "insufficient", missing: ["justification", "ruleBroken"] })
  })

  it("lets a version 1 record satisfy a v2 requirement", () => {
    expect(
      evaluateFindingVerdict(
        { version: 1, justification: "j" },
        [{ group: "toy", category: "low" }],
        config,
        fallback,
      ),
    ).toEqual({ verdict: "permitted", missing: [] })
  })

  it("forbids what the config forbids, whatever the record says", () => {
    expect(
      evaluateFindingVerdict(
        { version: 2, justification: "j", ruleBroken: "r" },
        [{ group: "toy", category: "critical" }],
        config,
        fallback,
      ),
    ).toEqual({ verdict: "forbidden", missing: [] })
  })
})
