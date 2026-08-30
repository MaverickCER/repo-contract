import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { tokenizeRunString } from "../../src/config/tokenize-command.js"
import { InvalidCheckConfigError } from "../../src/errors.js"

/**
 * Property-based tests for the `run: string` tokenizer -- see
 * src/config/tokenize-command.ts's own doc comment for the full grammar.
 * Each property states a precise, narrow claim (see
 * specs/verification-taxonomy.md's "security precision" note): this is NOT
 * a general "the tokenizer is secure against injection" claim, only the
 * specific argv-boundary-integrity and determinism guarantees the module's
 * own doc comment already promises.
 */

// Printable, non-whitespace characters that carry no special meaning to the
// tokenizer at all -- used to build "plain" tokens with no quoting/escaping
// involved, so the round-trip property doesn't need to model either.
const PLAIN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")
const plainToken = fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...PLAIN_CHARS) })

// Characters allowed inside a quoted argument for the argv-boundary property
// below -- deliberately excludes the quote character and backslash, so the
// property doesn't need to model escaping semantics to state its claim.
const QUOTABLE_CHARS = [
  ...PLAIN_CHARS,
  " ",
  ";",
  "&",
  "|",
  "`",
  "<",
  ">",
  "$",
  "(",
  ")",
  "*",
  "?",
  "~",
  "[",
  "]",
  "{",
  "}",
]
const quotableContent = fc.string({
  minLength: 0,
  maxLength: 20,
  unit: fc.constantFrom(...QUOTABLE_CHARS),
})

const REJECTED_OPERATORS = [";", "&", "|", "`", "<", ">"]

describe("tokenizeRunString -- property-based", () => {
  it("round-trips: space-joined plain tokens tokenize back to the same array", () => {
    fc.assert(
      fc.property(fc.array(plainToken, { minLength: 1, maxLength: 8 }), (tokens) => {
        const run = tokens.join(" ")
        expect(tokenizeRunString(run, "check")).toEqual(tokens)
      }),
      { numRuns: 200 },
    )
  })

  it("is deterministic: the same input always tokenizes to a deep-equal result (documented contract)", () => {
    fc.assert(
      fc.property(fc.array(plainToken, { minLength: 1, maxLength: 8 }), (tokens) => {
        const run = tokens.join(" ")
        expect(tokenizeRunString(run, "check")).toEqual(tokenizeRunString(run, "check"))
      }),
      { numRuns: 200 },
    )
  })

  it("argv-boundary integrity: any quoted content -- including operator characters -- always tokenizes to exactly one argument equal to that content", () => {
    fc.assert(
      fc.property(quotableContent, (content) => {
        const run = `"${content}"`
        const tokens = tokenizeRunString(run, "check")
        expect(tokens).toEqual([content])
      }),
      { numRuns: 300 },
    )
  })

  it("an unquoted rejected operator always throws InvalidCheckConfigError, regardless of surrounding plain content", () => {
    fc.assert(
      fc.property(
        plainToken,
        fc.constantFrom(...REJECTED_OPERATORS),
        plainToken,
        (before, operator, after) => {
          const run = `${before}${operator}${after}`
          expect(() => tokenizeRunString(run, "check")).toThrow(InvalidCheckConfigError)
        },
      ),
      { numRuns: 200 },
    )
  })
})
