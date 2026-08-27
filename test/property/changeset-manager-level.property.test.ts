import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { maxLevel, recoverHumanLevel } from "../../scripts/api-contract/changeset-manager.js"
import type { ChangesetReleaseLevel } from "../../scripts/api-contract/evidence-types.js"

/**
 * Property-based tests for changeset-manager.ts's two small pure level-arithmetic helpers: `maxLevel`
 * (a commutative, idempotent max over patch < minor < major, treating "no level" as the identity) and
 * `recoverHumanLevel` (the human-vs-machine ratchet from ADR 0008 -- a declared level only survives as
 * "human" when it strictly outranks the machine's own last claim).
 */

const RANK: Record<ChangesetReleaseLevel, number> = { patch: 1, minor: 2, major: 3 }
const levelArbitrary = fc.constantFrom<ChangesetReleaseLevel | undefined>(
  undefined,
  "patch",
  "minor",
  "major",
)

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

  it("always returns whichever of the two levels ranks at least as high as the other", () => {
    fc.assert(
      fc.property(levelArbitrary, levelArbitrary, (a, b) => {
        const result = maxLevel(a, b)
        const rank = (l: ChangesetReleaseLevel | undefined) => (l ? RANK[l] : 0)
        expect(rank(result)).toBe(Math.max(rank(a), rank(b)))
      }),
      { numRuns: 50 },
    )
  })
})

describe("recoverHumanLevel -- property-based", () => {
  it("is always undefined when no level was declared, regardless of the machine's prior claim", () => {
    fc.assert(
      fc.property(levelArbitrary, (previousMachineLevel) => {
        expect(recoverHumanLevel(undefined, previousMachineLevel)).toBeUndefined()
      }),
      { numRuns: 10 },
    )
  })

  it("only ever returns undefined or the declared level itself -- never invents another value", () => {
    fc.assert(
      fc.property(levelArbitrary, levelArbitrary, (declaredLevel, previousMachineLevel) => {
        const result = recoverHumanLevel(declaredLevel, previousMachineLevel)
        expect(result === undefined || result === declaredLevel).toBe(true)
      }),
      { numRuns: 50 },
    )
  })

  it("returns the declared level exactly when it strictly outranks the machine's prior claim", () => {
    fc.assert(
      fc.property(levelArbitrary, levelArbitrary, (declaredLevel, previousMachineLevel) => {
        const result = recoverHumanLevel(declaredLevel, previousMachineLevel)
        if (declaredLevel === undefined) {
          expect(result).toBeUndefined()
          return
        }
        const machineRank = previousMachineLevel ? RANK[previousMachineLevel] : 0
        const expected = RANK[declaredLevel] > machineRank ? declaredLevel : undefined
        expect(result).toBe(expected)
      }),
      { numRuns: 50 },
    )
  })
})
