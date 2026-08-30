import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  summarizeChanges,
  summarizeLowerTierChanges,
} from "../../scripts/api-contract/summarize-changes.js"
import type {
  ApiContractChange,
  ContractImpact,
} from "../../scripts/api-contract/evidence-types.js"

/**
 * Property-based tests for the two deterministic summary builders: every change's own `explanation`
 * must appear as its own `- ` line, in the same order as the input diff, and the fixed-sentence
 * branches (initial baseline, empty diff) must never depend on the diff/impact they're paired with.
 */

const explanationArbitrary = fc.stringMatching(/^[a-zA-Z0-9 ,._-]{1,40}$/)

function changeArbitrary(): fc.Arbitrary<ApiContractChange> {
  return explanationArbitrary.map((explanation): ApiContractChange => ({
    id: `!pkg#${explanation.replace(/\s+/g, "")}:function`,
    path: "somePath",
    kind: "export-added",
    compatibility: "compatible",
    explanation,
  }))
}

const impactArbitrary = fc.constantFrom<ContractImpact>(
  "unchanged",
  "compatible",
  "breaking",
  "unknown",
)

describe("summarizeChanges -- property-based", () => {
  it("always returns the fixed initial-baseline sentence when initialBaseline is true, regardless of diff/impact", () => {
    fc.assert(
      fc.property(
        fc.array(changeArbitrary(), { maxLength: 5 }),
        impactArbitrary,
        (diff, impact) => {
          expect(summarizeChanges(diff, impact, true)).toBe(
            "No historical public API contract exists. This run establishes the initial contract " +
              "baseline; v0.1.0 is recommended as the initial package version.",
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  it("always returns the fixed no-changes sentence for an empty diff (when not an initial baseline), regardless of impact", () => {
    fc.assert(
      fc.property(impactArbitrary, (impact) => {
        expect(summarizeChanges([], impact, false)).toBe("No public API changes detected.")
      }),
      { numRuns: 10 },
    )
  })

  it("every change's explanation appears as its own '- ' line, in diff order, after a count/impact header", () => {
    fc.assert(
      fc.property(
        fc.array(changeArbitrary(), { minLength: 1, maxLength: 8 }),
        impactArbitrary,
        (diff, impact) => {
          const result = summarizeChanges(diff, impact, false)
          const lines = result.split("\n")
          expect(lines.slice(1)).toEqual(diff.map((c) => `- ${c.explanation}`))
          expect(lines[0]).toContain(
            impact === "unknown"
              ? "could not be classified deterministically"
              : String(diff.length),
          )
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe("summarizeLowerTierChanges -- property-based", () => {
  it("returns undefined for an empty diff", () => {
    expect(summarizeLowerTierChanges([])).toBeUndefined()
  })

  it("every change's explanation appears as its own '- ' line, in diff order, after a count header", () => {
    fc.assert(
      fc.property(fc.array(changeArbitrary(), { minLength: 1, maxLength: 8 }), (diff) => {
        const result = summarizeLowerTierChanges(diff)
        expect(result).toBeDefined()
        const lines = (result ?? "").split("\n")
        expect(lines.slice(1)).toEqual(diff.map((c) => `- ${c.explanation}`))
        expect(lines[0]).toContain(String(diff.length))
      }),
      { numRuns: 200 },
    )
  })
})
