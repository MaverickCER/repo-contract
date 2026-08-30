import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { parseJson } from "../../src/parsing/parse-json.js"
import { parseText } from "../../src/parsing/parse-text.js"

/**
 * Round-trip properties for parseJson/parseText -- scoped to these two
 * specifically because their own contract explicitly promises round-tripping
 * (parseJson: "parses stdout as JSON"; parseText: an always-succeeding
 * trimmed passthrough), not a blanket claim about every parser in the
 * package (parseYaml is excluded -- its optional-peer-dependency contract is
 * exercised by test/unit/parsing/parse-yaml*.test.ts instead).
 */
// `-0` stringifies to the JSON literal `0` and parses back as `+0` -- JSON
// itself has no notation for negative zero, so a value containing `-0`
// cannot round-trip through JSON.stringify/JSON.parse by identity, through
// no fault of parseJson. Vitest's `toEqual` distinguishes `-0` from `0`
// (unlike `===`), so this one case is excluded from the round-trip property
// below rather than weakening the equality check for every other value.
function containsNegativeZero(value: unknown): boolean {
  if (typeof value === "number") return Object.is(value, -0)
  if (Array.isArray(value)) return value.some(containsNegativeZero)
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsNegativeZero)
  }
  return false
}

describe("parseJson -- property-based", () => {
  it("round-trips: JSON.stringify(value) always parses back to a deep-equal value", () => {
    fc.assert(
      fc.property(
        fc.jsonValue().filter((value) => !containsNegativeZero(value)),
        (value) => {
          const result = parseJson(JSON.stringify(value))
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.value).toEqual(value)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it("is deterministic: parsing the same stdout twice always produces a deep-equal result", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const stdout = JSON.stringify(value)
        expect(parseJson(stdout)).toEqual(parseJson(stdout))
      }),
      { numRuns: 200 },
    )
  })

  it("never throws -- malformed input always reports as a ParsedOutputFailure, never an exception", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (raw) => {
        expect(() => parseJson(raw)).not.toThrow()
      }),
      { numRuns: 200 },
    )
  })
})

describe("parseText -- property-based", () => {
  it("always succeeds with the trimmed input, for any string", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (raw) => {
        const result = parseText(raw)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.value).toBe(raw.trim())
        }
      }),
      { numRuns: 200 },
    )
  })
})
