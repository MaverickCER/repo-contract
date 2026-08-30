import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { maxLevel, rankAtLeast } from "../../scripts/api-contract/levels.js"
import type { RequiredReleaseLevel } from "../../scripts/api-contract/evidence-types.js"

/**
 * Property-based tests for levels.ts's SemVer bump-magnitude arithmetic (extracted from the
 * deleted changeset-manager.ts when versioning moved to Conventional Commits -- ADR 0009):
 * `maxLevel` (a commutative, idempotent max over none < patch < minor < major, with `undefined`
 * as the identity) and `rankAtLeast` (the gate's "declared >= required" comparison).
 */

const RANK: Record<RequiredReleaseLevel, number> = { none: 0, patch: 1, minor: 2, major: 3 }
const levelArbitrary = fc.constantFrom<RequiredReleaseLevel | undefined>(
  undefined,
  "none",
  "patch",
  "minor",
  "major",
)
const definedLevelArbitrary = fc.constantFrom<RequiredReleaseLevel>(
  "none",
  "patch",
  "minor",
  "major",
)

const rank = (l: RequiredReleaseLevel | undefined): number => (l === undefined ? -1 : RANK[l])

describe("maxLevel -- property-based", () => {
  it("is commutative", () => {
    fc.assert(
      fc.property(levelArbitrary, levelArbitrary, (a, b) => {
        expect(maxLevel(a, b)).toBe(maxLevel(b, a))
      }),
      { numRuns: 50 },
    )
  })

  it("is idempotent, and undefined is the identity element", () => {
    fc.assert(
      fc.property(levelArbitrary, (a) => {
        expect(maxLevel(a, a)).toBe(a)
        expect(maxLevel(a, undefined)).toBe(a)
        expect(maxLevel(undefined, a)).toBe(a)
      }),
      { numRuns: 50 },
    )
  })

  it("always returns whichever operand ranks at least as high as the other", () => {
    fc.assert(
      fc.property(levelArbitrary, levelArbitrary, (a, b) => {
        expect(rank(maxLevel(a, b))).toBe(Math.max(rank(a), rank(b)))
      }),
      { numRuns: 50 },
    )
  })
})

describe("rankAtLeast -- property-based", () => {
  it("agrees with the numeric rank comparison for every level pair", () => {
    fc.assert(
      fc.property(definedLevelArbitrary, definedLevelArbitrary, (declared, required) => {
        expect(rankAtLeast(declared, required)).toBe(RANK[declared] >= RANK[required])
      }),
      { numRuns: 50 },
    )
  })

  it('is reflexive, and everything satisfies a "none" requirement', () => {
    fc.assert(
      fc.property(definedLevelArbitrary, (level) => {
        expect(rankAtLeast(level, level)).toBe(true)
        expect(rankAtLeast(level, "none")).toBe(true)
      }),
      { numRuns: 20 },
    )
  })
})
