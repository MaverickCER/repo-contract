import { describe, it } from "vitest"

describe("R1 tiers: basic, app, library, strict", () => {
  it.todo(
    "basic() returns Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps in that order",
  )
  it.todo(
    "app() returns basic's checks then Build, DeadCode, Duplication, Licenses, DocsLinks and Coverage",
  )
  it.todo(
    "library() returns app's checks then Packaging, TypeResolution, BundledDependencies and QuickStart",
  )
  it.todo(
    "strict() returns library's checks then Mutation, Crap, DistNoUrls, DocsMarkdown and Commits",
  )
  it.todo("app() sets Duplication to 2% and Coverage to 80 on lines and statements")
  it.todo(
    "strict() sets Coverage to 80 on all four metrics, Duplication to 0.75%, Crap to 30 and 20, Mutation to 80",
  )
  it.todo(
    "Tests writes the coverage reports Coverage and Crap read (COVERAGE_VITEST_ARGS) from app upward",
  )
  it.todo("Coverage depends on Tests, and Crap depends on Coverage")
  it.todo("Mutation is isolated and declared last")
  it.todo(
    "an options override replaces the tier's options for that check and is recorded in tier.overrides",
  )
  it.todo(
    "a false override keeps the check in checks and makes it pass with a rationale naming the override",
  )
  it.todo("a false override lists the id in tier.off")
  it.todo("an override for a check the tier does not contain is rejected")
  it.todo("tier.settings is the tier's defaults with the overrides applied")
  it.todo("tier.planned lists the phase-2 checks at this tier and below")
  it.todo("tier(name) builds the same config as the named function")
  it.todo("the result spreads into defineRepoContract and validateRepoContractConfig accepts it")
})
