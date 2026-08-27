import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { parseNameStatusLine, parseNumstatCounts } from "../../scripts/diff-files.js"

/**
 * Property-based tests for diff-files.ts's two line-grammar parsers, which turn `git diff
 * --name-status -M` / `git diff --numstat -M` output into structured facts. Both grammars are simple
 * enough that every input shape can be generated directly, rather than curated example-by-example.
 */

const segmentArbitrary = fc.stringMatching(/^[a-zA-Z0-9_./-]{1,15}$/)

describe("parseNameStatusLine -- property-based", () => {
  it("a bare 'A' or 'D' status line always maps to added/deleted with the given path", () => {
    fc.assert(
      fc.property(fc.constantFrom("A", "D"), segmentArbitrary, (status, path) => {
        const result = parseNameStatusLine(`${status}\t${path}`)
        expect(result).toEqual({
          changeKind: status === "A" ? "added" : "deleted",
          path,
        })
      }),
      { numRuns: 200 },
    )
  })

  it("any status that isn't 'A', 'D', or 'R'-prefixed is always treated as a modification", () => {
    fc.assert(
      fc.property(fc.constantFrom("M", "C", "T", "U", "X"), segmentArbitrary, (status, path) => {
        const result = parseNameStatusLine(`${status}\t${path}`)
        expect(result).toEqual({ changeKind: "modified", path })
      }),
      { numRuns: 200 },
    )
  })

  it("an 'R'-prefixed status (with any similarity score) always maps to a rename from the first path to the second", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        segmentArbitrary,
        segmentArbitrary,
        (score, oldPath, newPath) => {
          const result = parseNameStatusLine(`R${String(score)}\t${oldPath}\t${newPath}`)
          expect(result).toEqual({ changeKind: "renamed", path: newPath, renamedFrom: oldPath })
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe("parseNumstatCounts -- property-based", () => {
  const columnArbitrary = fc.oneof(
    fc.nat({ max: 100_000 }).map((n) => String(n)),
    fc.constant("-"),
  )

  it("parses each column independently, treating '-' (a binary file marker) as 0", () => {
    fc.assert(
      fc.property(columnArbitrary, columnArbitrary, (addedRaw, removedRaw) => {
        const result = parseNumstatCounts(`${addedRaw}\t${removedRaw}`)
        expect(result).toEqual({
          linesAdded: addedRaw === "-" ? 0 : Number(addedRaw),
          linesRemoved: removedRaw === "-" ? 0 : Number(removedRaw),
        })
      }),
      { numRuns: 200 },
    )
  })

  it("never yields NaN -- a malformed / non-numeric column falls back to 0", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const { linesAdded, linesRemoved } = parseNumstatCounts(`${a}\t${b}`)
        expect(Number.isFinite(linesAdded)).toBe(true)
        expect(Number.isFinite(linesRemoved)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })
})
