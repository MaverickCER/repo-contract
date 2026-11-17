import { describe, expect, it } from "vitest"
import {
  LIBRARY_ONLY_CHECKS,
  plannedChecks,
  TIER_NAMES,
  tierChecks,
  tierDefinition,
  tierSettings,
} from "../../../src/tiers/catalog.js"
import type { TierName } from "../../../src/tiers/types.js"

const BASIC = ["Format", "Lint", "Typecheck", "Tests", "SecuritySecrets", "SecurityDeps"]
const APP = [...BASIC, "Build", "DeadCode", "Duplication", "Licenses", "DocsLinks", "Coverage"]
const LIBRARY = [...APP, "Packaging", "TypeResolution", "BundledDependencies", "QuickStart"]
// Mutation is declared last: it is an isolated barrier, so every other check finishes first.
const STRICT = [...LIBRARY, "Crap", "DistNoUrls", "DocsMarkdown", "Commits", "Mutation"]

const PRESET_SETTINGS = {
  Coverage: { lines: 80, statements: 80 },
  Duplication: { maxPercentage: 0 },
  Crap: { threshold: 30, maxComplexity: 20 },
  Mutation: { minScore: 80 },
}

const APP_SETTINGS = { ...PRESET_SETTINGS, Duplication: { maxPercentage: 2 } }

describe("R1 tier catalog", () => {
  it("TIER_NAMES lists basic, app, library, strict in that order", () => {
    expect(TIER_NAMES).toEqual(["basic", "app", "library", "strict"])
  })

  it("tierChecks(name) is the checks of every lower tier, then the tier's own", () => {
    expect(tierChecks("basic")).toEqual(BASIC)
    expect(tierChecks("app")).toEqual(APP)
    expect(tierChecks("library")).toEqual(LIBRARY)
    expect(tierChecks("strict")).toEqual(STRICT)
  })

  it("tierDefinition(name) names the tier it extends and only its own additions", () => {
    expect(tierDefinition("basic")).toMatchObject({
      name: "basic",
      extends: undefined,
      adds: BASIC,
    })
    expect(tierDefinition("app")).toMatchObject({
      name: "app",
      extends: "basic",
      adds: APP.slice(BASIC.length),
    })
    expect(tierDefinition("library")).toMatchObject({
      name: "library",
      extends: "app",
      adds: LIBRARY.slice(APP.length),
    })
    expect(tierDefinition("strict")).toMatchObject({
      name: "strict",
      extends: "library",
      adds: STRICT.slice(LIBRARY.length),
    })
  })

  it("tierDefinition(name) carries only the planned checks of that tier", () => {
    expect(tierDefinition("basic").planned).toEqual([])
    expect(tierDefinition("library").planned.map((check) => check.id)).toEqual([
      "PackedConsumer",
      "EngineMatrix",
    ])
  })

  it("tierSettings(name) gives the documented defaults for each tier", () => {
    expect(tierSettings("basic")).toEqual(PRESET_SETTINGS)
    expect(tierSettings("app")).toEqual(APP_SETTINGS)
    expect(tierSettings("library")).toEqual(APP_SETTINGS)
    expect(tierSettings("strict")).toEqual({
      Coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
      Duplication: { maxPercentage: 0.75 },
      Crap: { threshold: 30, maxComplexity: 20 },
      Mutation: { minScore: 80 },
    })
    for (const name of TIER_NAMES) {
      expect(tierDefinition(name).settings).toEqual(tierSettings(name))
    }
  })

  it("plannedChecks(name) lists nothing at basic", () => {
    expect(plannedChecks("basic")).toEqual([])
  })

  it("plannedChecks(name) lists DocsFragments, GithubActions and GitHygiene at app", () => {
    expect(plannedChecks("app").map(({ id, tier }) => [id, tier])).toEqual([
      ["DocsFragments", "app"],
      ["GithubActions", "app"],
      ["GitHygiene", "app"],
    ])
  })

  it("plannedChecks(name) adds PackedConsumer and EngineMatrix at library", () => {
    expect(plannedChecks("library").map(({ id, tier }) => [id, tier])).toEqual([
      ["DocsFragments", "app"],
      ["GithubActions", "app"],
      ["GitHygiene", "app"],
      ["PackedConsumer", "library"],
      ["EngineMatrix", "library"],
    ])
  })

  it("plannedChecks(name) adds Suppressions, SecurityDevDeps and CleanCheckout at strict", () => {
    expect(plannedChecks("strict").map(({ id }) => id)).toEqual([
      "DocsFragments",
      "GithubActions",
      "GitHygiene",
      "PackedConsumer",
      "EngineMatrix",
      "Suppressions",
      "SecurityDevDeps",
      "CleanCheckout",
    ])
    expect(
      plannedChecks("strict")
        .slice(5)
        .every(({ tier }) => tier === "strict"),
    ).toBe(true)
  })

  it("gives every planned check a reason of one sentence, 25 words or fewer", () => {
    for (const { id, reason } of plannedChecks("strict")) {
      expect(reason, id).toMatch(/^[A-Z`].*\.$/)
      expect(reason.slice(0, -1), id).not.toMatch(/\.\s/)
      expect(reason.split(/\s+/).length, id).toBeLessThanOrEqual(25)
      expect(reason, id).not.toMatch(/—| -- /)
    }
  })

  it("LIBRARY_ONLY_CHECKS names Packaging, TypeResolution, BundledDependencies and QuickStart", () => {
    expect(LIBRARY_ONLY_CHECKS).toEqual([
      "Packaging",
      "TypeResolution",
      "BundledDependencies",
      "QuickStart",
    ])
    expect(tierDefinition("library").adds).toEqual(LIBRARY_ONLY_CHECKS)
  })

  it("no planned check id is also a tier check id", () => {
    const tierIds = new Set<string>(tierChecks("strict"))
    expect(plannedChecks("strict").filter(({ id }) => tierIds.has(id))).toEqual([])
  })

  it("rejects a tier name it does not know, naming the four it does", () => {
    for (const lookup of [tierDefinition, tierChecks, tierSettings, plannedChecks]) {
      expect(() => lookup("fleet" as TierName)).toThrow(
        new TypeError('Unknown tier "fleet". The tiers are basic, app, library, strict.'),
      )
    }
    // An inherited property name must not pass for a tier.
    expect(() => tierChecks("toString" as TierName)).toThrow(TypeError)
  })
})
