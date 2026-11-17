import { describe, expect, it, vi } from "vitest"
import { commitlint } from "../../../src/presets/commitlint.js"
import { COVERAGE_VITEST_ARGS } from "../../../src/presets/coverage.js"
import { format } from "../../../src/presets/format.js"
import { test as testPreset } from "../../../src/presets/test.js"
import { plannedChecks, TIER_NAMES, tierChecks } from "../../../src/tiers/catalog.js"
import { app, basic, library, strict, tier } from "../../../src/tiers/tiers.js"
import type { TierName, TierOverrides } from "../../../src/tiers/types.js"
import type { CheckDefinitionConfig, PolicyResult } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "../presets/fixtures.js"

// Each factory preset is faked so a test can read back the options the tier passed it. One shared
// policy keeps two builds of the same tier deeply equal.
const { fakePreset } = vi.hoisted(() => {
  const policy = (): PolicyResult => ({ outcome: "pass", rationale: "Fake preset passed." })
  return {
    fakePreset: (preset: string) =>
      vi.fn((options?: unknown) => ({ run: [preset], policy, options })),
  }
})

vi.mock("../../../src/presets/coverage.js", () => ({
  coverage: fakePreset("coverage"),
  COVERAGE_VITEST_ARGS: ["--coverage.enabled=true"],
}))
vi.mock("../../../src/presets/crap.js", () => ({ crap: fakePreset("crap") }))
vi.mock("../../../src/presets/mutation.js", () => ({ mutation: fakePreset("mutation") }))
vi.mock("../../../src/presets/npm-script.js", () => ({ npmScript: fakePreset("npmScript") }))
vi.mock("../../../src/presets/duplication.js", () => ({ duplication: fakePreset("duplication") }))
vi.mock("../../../src/presets/broken-links.js", () => ({ brokenLinks: fakePreset("brokenLinks") }))
vi.mock("../../../src/presets/markdownlint.js", () => ({
  markdownlint: fakePreset("markdownlint"),
}))
vi.mock("../../../src/presets/security-deps.js", () => ({
  securityDeps: fakePreset("securityDeps"),
}))
vi.mock("../../../src/presets/arethetypeswrong.js", () => ({
  arethetypeswrong: fakePreset("arethetypeswrong"),
}))
vi.mock("../../../src/presets/dist-no-urls.js", () => ({ distNoUrls: fakePreset("distNoUrls") }))
vi.mock("../../../src/presets/quick-start.js", () => ({ quickStart: fakePreset("quickStart") }))
vi.mock("../../../src/presets/dead-code.js", () => ({ deadCode: fakePreset("deadCode") }))
vi.mock("../../../src/presets/lint.js", () => ({ lint: fakePreset("lint") }))
vi.mock("../../../src/presets/commitlint.js", () => ({ commitlint: fakePreset("commitlint") }))
vi.mock("../../../src/tiers/not-applicable.js", () => ({
  passWhenPrivate: (id: string, check: CheckDefinitionConfig) => ({ ...check, wrappedAs: id }),
}))

/**
 * @param check - a check a fake preset built.
 * @returns the options the tier passed that preset.
 */
function optionsOf(check: unknown): unknown {
  return (check as { options?: unknown }).options
}

/**
 * @param check - a check a tier built.
 * @returns what its policy decides on a clean, completed run.
 */
async function verdictOf(check: CheckDefinitionConfig): Promise<PolicyResult> {
  return check.policy(fakeContext(fakeCheckEvidence({ command: "node" })))
}

const BUILDERS = { basic, app, library, strict } as const satisfies Record<TierName, () => unknown>

describe("R1 tiers: basic, app, library, strict", () => {
  it("basic() returns Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps in that order", () => {
    expect(Object.keys(basic().checks)).toEqual([
      "Format",
      "Lint",
      "Typecheck",
      "Tests",
      "SecuritySecrets",
      "SecurityDeps",
    ])
  })

  it("app() returns basic's checks then Build, DeadCode, Duplication, Licenses, DocsLinks and Coverage", () => {
    expect(Object.keys(app().checks)).toEqual([
      ...Object.keys(basic().checks),
      "Build",
      "DeadCode",
      "Duplication",
      "Licenses",
      "DocsLinks",
      "Coverage",
    ])
  })

  it("library() returns app's checks then Packaging, TypeResolution, BundledDependencies and QuickStart", () => {
    expect(Object.keys(library().checks)).toEqual([
      ...Object.keys(app().checks),
      "Packaging",
      "TypeResolution",
      "BundledDependencies",
      "QuickStart",
    ])
  })

  it("strict() returns library's checks then Crap, DistNoUrls, DocsMarkdown, Commits and Mutation", () => {
    expect(Object.keys(strict().checks)).toEqual([
      ...Object.keys(library().checks),
      "Crap",
      "DistNoUrls",
      "DocsMarkdown",
      "Commits",
      "Mutation",
    ])
  })

  it("each tier's checks match tierChecks(name) and tier.checks", () => {
    for (const name of TIER_NAMES) {
      const config = BUILDERS[name]()
      expect(Object.keys(config.checks)).toEqual(tierChecks(name))
      expect(config.tier.checks).toEqual(tierChecks(name))
      expect(config.tier.name).toBe(name)
    }
  })

  it("app() sets Duplication to 2% and Coverage to 80 on lines and statements", () => {
    for (const config of [app(), library()]) {
      expect(optionsOf(config.checks.Duplication)).toEqual({ maxPercentage: 2 })
      expect(optionsOf(config.checks.Coverage)).toEqual({
        thresholds: { lines: 80, statements: 80 },
      })
    }
  })

  it("strict() sets Coverage to 80 on all four metrics, Duplication to 0.75%, Crap to 30 and 20, Mutation to 80", () => {
    const { checks } = strict()
    expect(optionsOf(checks.Coverage)).toEqual({
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    })
    expect(optionsOf(checks.Duplication)).toEqual({ maxPercentage: 0.75 })
    expect(optionsOf(checks.Crap)).toEqual({ threshold: 30, maxComplexity: 20 })
    expect(optionsOf(checks.Mutation)).toEqual({ minScore: 80 })
  })

  it("passes the documented defaults to the other configurable checks", () => {
    const { checks } = strict()
    expect(optionsOf(checks.SecurityDeps)).toEqual({
      registry: ".repo-contract/exceptions/security-deps.json",
    })
    expect(optionsOf(checks.Build)).toEqual({ script: "build", whenMissing: "skip" })
    expect(optionsOf(checks.DocsLinks)).toEqual({
      start: [
        { path: "README.md", mode: "markdown" },
        { path: "docs", mode: "html" },
      ],
    })
    expect(optionsOf(checks.DocsMarkdown)).toEqual({
      globs: ["*.md", "docs/**/*.md"],
      verdict: "exit-code",
    })
    // TypeResolution judges every resolution unless told otherwise.
    for (const id of [
      "Lint",
      "DeadCode",
      "TypeResolution",
      "QuickStart",
      "DistNoUrls",
      "Commits",
    ]) {
      expect(optionsOf(checks[id as keyof typeof checks]), id).toEqual({})
    }
  })

  it("Format checks formatting with prettier --check and keeps the format preset's policy", () => {
    const { Format } = basic().checks
    expect(Format.run).toEqual(["prettier", "--check", "."])
    expect(Format.policy).toBe(format.policy)
  })

  it("adds the coverage flags to Tests alone, never to another fixed check", () => {
    const { checks } = strict()
    expect(checks.Format.run).toEqual(["prettier", "--check", "."])
    for (const id of ["Typecheck", "SecuritySecrets", "Licenses"] as const) {
      expect(checks[id].run, id).not.toEqual(expect.arrayContaining([...COVERAGE_VITEST_ARGS]))
    }
  })

  it("Tests writes the coverage reports Coverage and Crap read (COVERAGE_VITEST_ARGS) from app upward", () => {
    expect(basic().checks.Tests).toBe(testPreset)
    for (const config of [app(), library(), strict()]) {
      expect(config.checks.Tests.run).toEqual([
        ...(testPreset.run as readonly string[]),
        "--coverage.enabled=true",
      ])
      expect(config.checks.Tests.run).toEqual(expect.arrayContaining([...COVERAGE_VITEST_ARGS]))
      expect(config.checks.Tests.policy).toBe(testPreset.policy)
    }
  })

  it("Coverage depends on Tests, and Crap depends on Coverage", () => {
    const { checks } = strict()
    const dependencies = Object.entries(checks)
      .filter(([, check]) => check.dependsOn !== undefined)
      .map(([id, check]) => [id, check.dependsOn])
    expect(dependencies).toEqual([
      ["Coverage", ["Tests"]],
      ["Crap", ["Coverage"]],
    ])
  })

  it("Mutation is isolated and declared last; Build is isolated too", () => {
    const { checks } = strict()
    expect(Object.keys(checks).at(-1)).toBe("Mutation")
    const isolated = Object.entries(checks)
      .filter(([, check]) => check.isolated === true)
      .map(([id]) => id)
    expect(isolated).toEqual(["Build", "Mutation"])
  })

  it("wraps only the four library-only checks to pass on a private package", () => {
    const wrapped = Object.entries(strict().checks)
      .filter(([, check]) => "wrappedAs" in check)
      .map(([id, check]) => [id, (check as { wrappedAs?: string }).wrappedAs])
    expect(wrapped).toEqual([
      ["Packaging", "Packaging"],
      ["TypeResolution", "TypeResolution"],
      ["BundledDependencies", "BundledDependencies"],
      ["QuickStart", "QuickStart"],
    ])
  })

  it("an options override merges over the tier's options for that check and is recorded in tier.overrides", () => {
    const overrides = {
      DocsLinks: { start: "docs" },
      TypeResolution: { ignoreResolutions: ["node10"] },
    } as const
    const config = strict(overrides)
    // A key the override names replaces the tier's value for that key whole.
    expect(optionsOf(config.checks.DocsLinks)).toEqual({ start: "docs" })
    expect(optionsOf(config.checks.TypeResolution)).toEqual({ ignoreResolutions: ["node10"] })
    expect(config.tier.overrides).toBe(overrides)
    expect(config.tier.off).toEqual([])
  })

  it("keeps the tier's duplication budget when an override only narrows the path", () => {
    expect(optionsOf(strict({ Duplication: { path: "src" } }).checks.Duplication)).toEqual({
      maxPercentage: 0.75,
      path: "src",
    })
    expect(optionsOf(app({ Duplication: { path: "src" } }).checks.Duplication)).toEqual({
      maxPercentage: 2,
      path: "src",
    })
    expect(strict({ Duplication: { path: "src" } }).tier.settings.Duplication).toEqual({
      maxPercentage: 0.75,
    })
  })

  it("keeps the tier's markdown globs and verdict when an override only names a config", () => {
    expect(
      optionsOf(strict({ DocsMarkdown: { config: ".markdownlint.jsonc" } }).checks.DocsMarkdown),
    ).toEqual({
      globs: ["*.md", "docs/**/*.md"],
      verdict: "exit-code",
      config: ".markdownlint.jsonc",
    })
  })

  it("keeps the tier's registry when a SecurityDeps override is empty, and drops it on registry: false", () => {
    expect(optionsOf(basic({ SecurityDeps: {} }).checks.SecurityDeps)).toEqual({
      registry: ".repo-contract/exceptions/security-deps.json",
    })
    expect(optionsOf(basic({ SecurityDeps: { registry: false } }).checks.SecurityDeps)).toEqual({
      registry: false,
    })
  })

  it("keeps the tier's Crap and Mutation settings an override leaves out", () => {
    const { checks } = strict({ Crap: { src: "lib" }, Mutation: { shard: "1/4" } })
    expect(optionsOf(checks.Crap)).toEqual({ threshold: 30, maxComplexity: 20, src: "lib" })
    expect(optionsOf(checks.Mutation)).toEqual({ minScore: 80, shard: "1/4" })
  })

  it("merges a Coverage override's thresholds per metric and its other options over the tier's", () => {
    expect(
      optionsOf(
        strict({ Coverage: { thresholds: { branches: 70 }, summary: "out/summary.json" } }).checks
          .Coverage,
      ),
    ).toEqual({
      summary: "out/summary.json",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    })
    expect(optionsOf(app({ Coverage: { summary: "out/summary.json" } }).checks.Coverage)).toEqual({
      summary: "out/summary.json",
      thresholds: { lines: 80, statements: 80 },
    })
  })

  it("lays a Build override over the build script defaults, since npmScript needs a script", () => {
    expect(optionsOf(app({ Build: { timeoutMs: 60_000 } }).checks.Build)).toEqual({
      script: "build",
      whenMissing: "skip",
      timeoutMs: 60_000,
    })
    expect(
      optionsOf(app({ Build: { script: "compile", whenMissing: "fail" } }).checks.Build),
    ).toEqual({
      script: "compile",
      whenMissing: "fail",
    })
    expect(app({ Build: { script: "compile" } }).checks.Build.isolated).toBe(true)
  })

  it("keeps Mutation isolated and Coverage and Crap ordered under an options override", () => {
    const { checks } = strict({
      Mutation: { minScore: 100 },
      Coverage: { summary: "x.json" },
      Crap: { threshold: 15 },
    })
    expect(checks.Mutation.isolated).toBe(true)
    expect(checks.Coverage.dependsOn).toEqual(["Tests"])
    expect(checks.Crap.dependsOn).toEqual(["Coverage"])
  })

  it("a false override keeps the check in checks and makes it pass with a rationale naming the override", async () => {
    vi.mocked(commitlint).mockClear()
    const { checks } = strict({ Commits: false })
    expect(Object.keys(checks)).toEqual(tierChecks("strict"))
    expect(commitlint).not.toHaveBeenCalled()
    expect(checks.Commits.run).toEqual(["node", "-e", ""])
    expect(await verdictOf(checks.Commits)).toEqual({
      outcome: "pass",
      rationale:
        "Commits is off: the strict() overrides set Commits: false, so its tool did not run.",
    })
  })

  it("a turned-off check still fails when even its no-op process ends abnormally", async () => {
    const { checks } = basic({ Lint: false })
    const result = await checks.Lint.policy(
      fakeContext(fakeCheckEvidence({ command: "node", exitCode: null, status: "timed_out" })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toMatch(/^node did not finish/)
  })

  it("a turned-off check drops its scheduling, and checks that depend on it keep their dependsOn", () => {
    const { checks } = strict({ Coverage: false, Mutation: false, Build: false })
    expect(checks.Coverage.dependsOn).toBeUndefined()
    expect(checks.Crap.dependsOn).toEqual(["Coverage"])
    expect(checks.Mutation.isolated).toBeUndefined()
    expect(checks.Build.isolated).toBeUndefined()
  })

  it("a false override lists the id in tier.off, in schedule order", () => {
    expect(strict({ Mutation: false, Commits: false, Lint: false }).tier.off).toEqual([
      "Lint",
      "Commits",
      "Mutation",
    ])
    expect(basic().tier.off).toEqual([])
  })

  it("treats an override left undefined as no override", () => {
    const config = strict({ Commits: undefined, Duplication: undefined })
    expect(config.tier.off).toEqual([])
    expect(optionsOf(config.checks.Duplication)).toEqual({ maxPercentage: 0.75 })
  })

  it("an override for a check the tier does not contain is rejected", () => {
    expect(() => basic({ Coverage: { thresholds: {} } } as TierOverrides<"Format">)).toThrow(
      new TypeError(
        'basic() has no check "Coverage". Its checks are Format, Lint, Typecheck, Tests, SecuritySecrets, SecurityDeps.',
      ),
    )
    expect(() => app({ Mutation: false } as TierOverrides<"Format">)).toThrow(
      /^app\(\) has no check "Mutation"\./,
    )
    expect(() => strict({ Fleet: false } as TierOverrides)).toThrow(TypeError)
  })

  it("rejects an override that is neither false nor an options object", () => {
    for (const value of [true, null, "off", 0, ["src"]]) {
      expect(() => strict({ Lint: value } as unknown as TierOverrides), String(value)).toThrow(
        new TypeError("The Lint override must be an options object or false."),
      )
    }
  })

  it("rejects options for a check that takes none", () => {
    for (const id of [
      "Format",
      "Typecheck",
      "Tests",
      "SecuritySecrets",
      "Licenses",
      "Packaging",
      "BundledDependencies",
    ]) {
      expect(() => strict({ [id]: {} }), id).toThrow(
        new TypeError(`${id} takes no options. Pass ${id}: false to turn it off.`),
      )
    }
  })

  it("tier.settings is the tier's defaults with the overrides applied", () => {
    expect(strict().tier.settings).toEqual({
      Coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
      Duplication: { maxPercentage: 0.75 },
      Crap: { threshold: 30, maxComplexity: 20 },
      Mutation: { minScore: 80 },
    })
    expect(
      strict({
        Coverage: { thresholds: { branches: 70 } },
        Duplication: { maxPercentage: 1 },
        Crap: { threshold: 40 },
        Mutation: { minScore: 100 },
      }).tier.settings,
    ).toEqual({
      Coverage: { lines: 80, statements: 80, functions: 80, branches: 70 },
      Duplication: { maxPercentage: 1 },
      Crap: { threshold: 40, maxComplexity: 20 },
      Mutation: { minScore: 100 },
    })
  })

  it("tier.settings keeps the tier's value for a setting an override leaves out", () => {
    const { settings } = strict({
      Duplication: { path: "src" },
      Crap: { src: "lib", maxComplexity: 10 },
      Mutation: { shard: "1/4" },
    }).tier
    expect(settings.Duplication).toEqual({ maxPercentage: 0.75 })
    expect(settings.Crap).toEqual({ threshold: 30, maxComplexity: 10 })
    expect(settings.Mutation).toEqual({ minScore: 80 })
  })

  it("tier.settings reports the preset's own default for a setting an override sets to undefined", () => {
    const { settings } = strict({
      Duplication: { maxPercentage: undefined },
      Crap: { threshold: undefined, maxComplexity: undefined },
      Mutation: { minScore: undefined },
      Coverage: { thresholds: { functions: undefined } },
    }).tier
    // The preset reads an undefined option as its own default, so the settings must too.
    expect(settings.Duplication).toEqual({ maxPercentage: 0 })
    expect(settings.Crap).toEqual({ threshold: 30, maxComplexity: 20 })
    expect(settings.Mutation).toEqual({ minScore: 80 })
    // Coverage judges no metric left undefined, so the metric is simply absent.
    expect(settings.Coverage.functions).toBeUndefined()
    expect(settings.Coverage.branches).toBe(80)
  })

  it("tier.settings keeps the defaults for a check turned off", () => {
    expect(strict({ Coverage: false, Mutation: false }).tier.settings).toEqual(
      strict().tier.settings,
    )
  })

  it("tier.planned lists the phase-2 checks at this tier and below", () => {
    for (const name of TIER_NAMES) {
      expect(BUILDERS[name]().tier.planned).toEqual(plannedChecks(name))
    }
  })

  it("tier(name) builds the same config as the named function", () => {
    const overrides = { Coverage: { thresholds: { branches: 70 } }, Duplication: { path: "src" } }
    expect(tier("strict", overrides)).toEqual(strict(overrides))
    expect(tier("app", overrides)).toEqual(app(overrides))
    expect(tier("library")).toEqual(library())
    expect(tier("basic")).toEqual(basic())
  })

  it("every tier rejects overrides that are not an object, naming the tier", () => {
    for (const name of TIER_NAMES) {
      for (const value of [null, 42, "Lint", ["Lint"]]) {
        const message = new TypeError(`${name}() takes an object of overrides keyed by check id.`)
        expect(() => BUILDERS[name](value as unknown as TierOverrides<"Format">), name).toThrow(
          message,
        )
        expect(() => tier(name, value as unknown as TierOverrides), name).toThrow(message)
      }
    }
  })

  it("tier(name) rejects a tier it does not know", () => {
    expect(() => tier("fleet" as TierName)).toThrow(
      new TypeError('Unknown tier "fleet". The tiers are basic, app, library, strict.'),
    )
  })
})
