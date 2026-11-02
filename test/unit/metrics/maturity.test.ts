import { describe, expect, it } from "vitest"
import { maturityLevel } from "../../../src/metrics/maturity.js"
import type { MaturityInput } from "../../../src/metrics/maturity.js"

const none = {
  correctness: 0,
  security: 0,
  performance: 0,
  accessibility: 0,
  compliance: 0,
  maintainability: 0,
}
const all = {
  correctness: 3,
  security: 2,
  performance: 1,
  accessibility: 1,
  compliance: 1,
  maintainability: 4,
}

const level4: MaturityInput = {
  hasRuns: true,
  pillars: all,
  lastFullRunPassed: true,
  exceptions: { count: 2, budget: 5 },
  zeroTolerance: true,
  canaryClean: true,
  manifestPresent: true,
}

describe("maturityLevel", () => {
  it("is level 0 with no runs", () => {
    const result = maturityLevel({ ...level4, hasRuns: false })
    expect(result.level).toBe(0)
    expect(result.next).toEqual({ level: 1, missing: ["at least one recorded run"] })
  })

  it("is level 0 when no check covers correctness", () => {
    const result = maturityLevel({ ...level4, pillars: { ...all, correctness: 0 } })
    expect(result.level).toBe(0)
    expect(result.next?.missing).toEqual(["a check for the correctness pillar"])
  })

  it("is level 1 with runs and correctness covered", () => {
    const result = maturityLevel({
      ...level4,
      pillars: { ...none, correctness: 1 },
      lastFullRunPassed: undefined,
    })
    expect(result.level).toBe(1)
    expect(result.next).toEqual({
      level: 2,
      missing: [
        "a check for the security pillar",
        "a check for the maintainability pillar",
        "a passing full-scope run",
      ],
    })
  })

  it("does not count a failed full-scope run as passing", () => {
    expect(maturityLevel({ ...level4, lastFullRunPassed: false }).level).toBe(1)
  })

  it("is level 2 with the core pillars and a passing full run, and says what level 3 needs", () => {
    const result = maturityLevel({
      ...level4,
      pillars: { ...none, correctness: 1, security: 1, maintainability: 1 },
    })
    expect(result.level).toBe(2)
    expect(result.next).toEqual({
      level: 3,
      missing: [
        "a check for the performance pillar",
        "a check for the accessibility pillar",
        "a check for the compliance pillar",
      ],
    })
  })

  it("needs exceptions within budget and zero-tolerance policies for level 3", () => {
    const over = maturityLevel({ ...level4, exceptions: { count: 6, budget: 5 } })
    expect(over.level).toBe(2)
    expect(over.next?.missing).toEqual(["exceptions within budget (6 of 5)"])
    const lax = maturityLevel({ ...level4, zeroTolerance: false })
    expect(lax.level).toBe(2)
    expect(lax.next?.missing).toEqual(["zero-tolerance policies switched on"])
  })

  it("allows exactly the budget", () => {
    expect(maturityLevel({ ...level4, exceptions: { count: 5, budget: 5 } }).level).toBe(4)
  })

  it("is level 3 until the canary is clean and the evidence manifest exists", () => {
    const result = maturityLevel({ ...level4, canaryClean: undefined, manifestPresent: false })
    expect(result.level).toBe(3)
    expect(result.next).toEqual({
      level: 4,
      missing: ["a clean soundness canary", "an evidence manifest"],
    })
    expect(maturityLevel({ ...level4, canaryClean: false }).next?.missing).toEqual([
      "a clean soundness canary",
    ])
  })

  it("is level 4 with everything, and has no next level", () => {
    const result = maturityLevel(level4)
    expect(result.level).toBe(4)
    expect(result).not.toHaveProperty("next")
  })

  it("is monotonic: a level is only reached through the ones below it", () => {
    // everything for level 4 except the level-1 requirement
    expect(maturityLevel({ ...level4, hasRuns: false }).level).toBe(0)
    // everything for level 4 except the level-2 requirement
    expect(maturityLevel({ ...level4, lastFullRunPassed: undefined }).level).toBe(1)
  })
})
