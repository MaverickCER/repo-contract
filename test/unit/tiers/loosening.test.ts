import { describe, expect, it } from "vitest"
import { compareSetting, LOOSENING_RULES } from "../../../src/tiers/loosening.js"

describe("R1e loosening rules", () => {
  it("a higher coverage threshold is stricter and a lower one looser", () => {
    expect(compareSetting("higher-is-stricter", 80, 90)).toBe("stricter")
    expect(compareSetting("higher-is-stricter", 80, 70)).toBe("looser")
  })

  it("a higher mutation minScore is stricter and a lower one looser", () => {
    expect(compareSetting("higher-is-stricter", 80, 100)).toBe("stricter")
    expect(compareSetting("higher-is-stricter", 100, 80)).toBe("looser")
  })

  it("a lower duplication budget is stricter and a higher one looser", () => {
    expect(compareSetting("lower-is-stricter", 2, 0.75)).toBe("stricter")
    expect(compareSetting("lower-is-stricter", 0.75, 2)).toBe("looser")
  })

  it("a lower CRAP threshold or complexity ceiling is stricter and a higher one looser", () => {
    expect(compareSetting("lower-is-stricter", 30, 15)).toBe("stricter")
    expect(compareSetting("lower-is-stricter", 20, 25)).toBe("looser")
  })

  it("an equal value is the same", () => {
    expect(compareSetting("higher-is-stricter", 80, 80)).toBe("same")
    expect(compareSetting("lower-is-stricter", 0, 0)).toBe("same")
    expect(compareSetting("lower-is-stricter", undefined, undefined)).toBe("same")
  })

  it("a value the baseline judges but the config leaves undefined is looser", () => {
    expect(compareSetting("higher-is-stricter", 80, undefined)).toBe("looser")
    expect(compareSetting("lower-is-stricter", 0, undefined)).toBe("looser")
  })

  it("a value only the config judges is stricter", () => {
    expect(compareSetting("higher-is-stricter", undefined, 0)).toBe("stricter")
    expect(compareSetting("lower-is-stricter", undefined, 100)).toBe("stricter")
  })

  it("LOOSENING_RULES covers Coverage's four metrics, Duplication, Crap's two ceilings and Mutation", () => {
    expect(LOOSENING_RULES).toEqual([
      { check: "Coverage", setting: "lines", direction: "higher-is-stricter" },
      { check: "Coverage", setting: "statements", direction: "higher-is-stricter" },
      { check: "Coverage", setting: "functions", direction: "higher-is-stricter" },
      { check: "Coverage", setting: "branches", direction: "higher-is-stricter" },
      { check: "Duplication", setting: "maxPercentage", direction: "lower-is-stricter" },
      { check: "Crap", setting: "threshold", direction: "lower-is-stricter" },
      { check: "Crap", setting: "maxComplexity", direction: "lower-is-stricter" },
      { check: "Mutation", setting: "minScore", direction: "higher-is-stricter" },
    ])
  })
})
