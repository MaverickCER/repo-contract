import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  compareVersions,
  computeMinimumRequiredVersion,
  formatVersion,
  parseVersion,
} from "../../scripts/api-contract/semver.js"

const versionArbitrary = fc.record({
  major: fc.nat({ max: 50 }),
  minor: fc.nat({ max: 50 }),
  patch: fc.nat({ max: 50 }),
})

describe("semver helpers -- property-based", () => {
  it("compareVersions is reflexive: a version always compares equal to itself", () => {
    fc.assert(
      fc.property(versionArbitrary, (v) => {
        expect(compareVersions(v, v)).toBe(0)
      }),
      { numRuns: 200 },
    )
  })

  it("compareVersions is antisymmetric: swapping the arguments always flips the sign", () => {
    fc.assert(
      fc.property(versionArbitrary, versionArbitrary, (a, b) => {
        expect(Math.sign(compareVersions(a, b))).toBe(-Math.sign(compareVersions(b, a)))
      }),
      { numRuns: 200 },
    )
  })

  it("formatVersion/parseVersion round-trip for any non-negative major.minor.patch triple", () => {
    fc.assert(
      fc.property(versionArbitrary, (v) => {
        expect(parseVersion(formatVersion(v))).toEqual(v)
      }),
      { numRuns: 200 },
    )
  })

  it("computeMinimumRequiredVersion bumps exactly the requested component and resets everything below it", () => {
    fc.assert(
      fc.property(versionArbitrary, fc.constantFrom("patch", "minor", "major"), (base, level) => {
        const result = parseVersion(computeMinimumRequiredVersion(base, level))
        expect(result).toBeDefined()
        if (!result) return

        if (level === "patch") {
          expect(result).toEqual({ major: base.major, minor: base.minor, patch: base.patch + 1 })
        } else if (level === "minor") {
          expect(result).toEqual({ major: base.major, minor: base.minor + 1, patch: 0 })
        } else {
          expect(result).toEqual({ major: base.major + 1, minor: 0, patch: 0 })
        }
      }),
      { numRuns: 200 },
    )
  })

  it('computeMinimumRequiredVersion with requiredLevel "none" always returns the base version unchanged', () => {
    fc.assert(
      fc.property(versionArbitrary, (base) => {
        expect(computeMinimumRequiredVersion(base, "none")).toBe(formatVersion(base))
      }),
      { numRuns: 200 },
    )
  })

  it('computeMinimumRequiredVersion with no baseline always returns "0.1.0", regardless of requiredLevel', () => {
    fc.assert(
      fc.property(fc.constantFrom("none", "patch", "minor", "major"), (level) => {
        expect(computeMinimumRequiredVersion(undefined, level)).toBe("0.1.0")
      }),
      { numRuns: 10 },
    )
  })
})
