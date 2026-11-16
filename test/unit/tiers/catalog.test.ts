import { describe, it } from "vitest"

describe("R1 tier catalog", () => {
  it.todo("TIER_NAMES lists basic, app, library, strict in that order")
  it.todo("tierChecks(name) is the checks of every lower tier, then the tier's own")
  it.todo("tierSettings(name) gives the documented defaults for each tier")
  it.todo("plannedChecks(name) lists DocsFragments, GithubActions and GitHygiene at app")
  it.todo("plannedChecks(name) adds PackedConsumer and EngineMatrix at library")
  it.todo("plannedChecks(name) adds Suppressions, SecurityDevDeps and CleanCheckout at strict")
  it.todo("LIBRARY_ONLY_CHECKS names Packaging, TypeResolution, BundledDependencies and QuickStart")
  it.todo("no planned check id is also a tier check id")
})
