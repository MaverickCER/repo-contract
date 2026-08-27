import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { parseExistingDescriptions, renderRow } from "../../scripts/changeset-docs/table-manager.js"
import type { RawDiffFile } from "../../scripts/diff-files.js"

/**
 * Property-based tests for table-manager.ts's row round-trip: a description written into a generated
 * section by renderRow must be recoverable, verbatim, by parseExistingDescriptions on the next run --
 * this is the mechanism that lets a human/AI-authored description survive across regenerations. `path`
 * and `description` are restricted to plain single-line text that can't be confused with ROW_REGEX's
 * own delimiters (`**`, `(`, `)`), matching what a real file path/description looks like.
 */

const PLACEHOLDER = "_(needs description)_"

const pathArbitrary = fc.stringMatching(/^[a-zA-Z0-9_./-]{1,20}$/)
const descriptionArbitrary = fc
  .stringMatching(/^[a-zA-Z0-9 ,._-]{1,30}$/)
  .filter((d) => d.trim().length > 0 && d !== PLACEHOLDER)

const fileArbitrary: fc.Arbitrary<RawDiffFile> = fc.oneof(
  fc.record({
    path: pathArbitrary,
    changeKind: fc.constantFrom<RawDiffFile["changeKind"]>("added", "modified", "deleted"),
    linesAdded: fc.nat({ max: 9999 }),
    linesRemoved: fc.nat({ max: 9999 }),
  }),
  fc.record({
    path: pathArbitrary,
    changeKind: fc.constant<RawDiffFile["changeKind"]>("renamed"),
    renamedFrom: pathArbitrary,
    linesAdded: fc.nat({ max: 9999 }),
    linesRemoved: fc.nat({ max: 9999 }),
  }),
)

describe("renderRow/parseExistingDescriptions -- property-based", () => {
  it("a real description round-trips verbatim through a generated section", () => {
    fc.assert(
      fc.property(fileArbitrary, descriptionArbitrary, (file, description) => {
        const sectionBody = ["### Changed Files", "", renderRow(file, description), ""].join("\n")
        expect(parseExistingDescriptions(sectionBody).get(file.path)).toBe(description)
      }),
      { numRuns: 200 },
    )
  })

  it("a row with no description (the placeholder) never appears in the recovered map", () => {
    fc.assert(
      fc.property(fileArbitrary, (file) => {
        const sectionBody = ["### Changed Files", "", renderRow(file, undefined), ""].join("\n")
        expect(parseExistingDescriptions(sectionBody).has(file.path)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it("recovers exactly one description per distinct path when several rows are present", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fileArbitrary, descriptionArbitrary), {
          minLength: 1,
          maxLength: 5,
          selector: ([file]) => file.path,
        }),
        (entries) => {
          const sectionBody = [
            "### Changed Files",
            "",
            ...entries.map(([file, description]) => renderRow(file, description)),
            "",
          ].join("\n")
          const parsed = parseExistingDescriptions(sectionBody)
          expect(parsed.size).toBe(entries.length)
          for (const [file, description] of entries) {
            expect(parsed.get(file.path)).toBe(description)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
