import { describe, expect, it } from "vitest"
import {
  compareVersions,
  computeMinimumRequiredVersion,
  formatVersion,
  parseVersion,
} from "../../../scripts/api-contract/semver.js"

describe("parseVersion", () => {
  it("parses a plain major.minor.patch", () => {
    expect(parseVersion("1.4.2")).toEqual({ major: 1, minor: 4, patch: 2 })
  })

  it("ignores a prerelease/build suffix", () => {
    expect(parseVersion("1.4.2-beta.1")).toEqual({ major: 1, minor: 4, patch: 2 })
    expect(parseVersion("1.4.2+build.5")).toEqual({ major: 1, minor: 4, patch: 2 })
  })

  it("returns undefined for non-semver input", () => {
    expect(parseVersion("not-a-version")).toBeUndefined()
    expect(parseVersion("1.4")).toBeUndefined()
    expect(parseVersion("")).toBeUndefined()
  })
})

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(
      compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }),
    ).toBeLessThan(0)
    expect(
      compareVersions({ major: 1, minor: 5, patch: 0 }, { major: 1, minor: 4, patch: 0 }),
    ).toBeGreaterThan(0)
    expect(
      compareVersions({ major: 1, minor: 4, patch: 9 }, { major: 1, minor: 4, patch: 2 }),
    ).toBeGreaterThan(0)
    expect(
      compareVersions({ major: 1, minor: 4, patch: 2 }, { major: 1, minor: 4, patch: 2 }),
    ).toBe(0)
  })
})

describe("formatVersion", () => {
  it("renders major.minor.patch", () => {
    expect(formatVersion({ major: 1, minor: 4, patch: 2 })).toBe("1.4.2")
  })
})

describe("computeMinimumRequiredVersion", () => {
  it("is always 0.1.0 when there is no baseline, regardless of level", () => {
    expect(computeMinimumRequiredVersion(undefined, "none")).toBe("0.1.0")
    expect(computeMinimumRequiredVersion(undefined, "patch")).toBe("0.1.0")
    expect(computeMinimumRequiredVersion(undefined, "major")).toBe("0.1.0")
  })

  it("returns the baseline unchanged for level 'none'", () => {
    expect(computeMinimumRequiredVersion({ major: 1, minor: 4, patch: 2 }, "none")).toBe("1.4.2")
  })

  it("bumps patch", () => {
    expect(computeMinimumRequiredVersion({ major: 1, minor: 4, patch: 2 }, "patch")).toBe("1.4.3")
  })

  it("bumps minor and resets patch", () => {
    expect(computeMinimumRequiredVersion({ major: 1, minor: 4, patch: 2 }, "minor")).toBe("1.5.0")
  })

  it("bumps major and resets minor/patch", () => {
    expect(computeMinimumRequiredVersion({ major: 1, minor: 4, patch: 2 }, "major")).toBe("2.0.0")
  })
})
