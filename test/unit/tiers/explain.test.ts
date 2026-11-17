import { describe, expect, it } from "vitest"
import { plannedChecks, tierChecks, tierSettings } from "../../../src/tiers/catalog.js"
import { explainTier, renderExplain, tierBaseline } from "../../../src/tiers/explain.js"
import type { ExplainBaseline } from "../../../src/tiers/explain.js"
import { app, basic, strict } from "../../../src/tiers/tiers.js"
import type { CheckDefinitionConfig } from "../../../src/types.js"

const HAND_WRITTEN: CheckDefinitionConfig = {
  run: ["node", "-e", ""],
  policy: () => ({ outcome: "pass", rationale: "The hand-written check passed." }),
}

const IPC_BASELINE: ExplainBaseline = {
  ...tierBaseline("strict"),
  name: "internal-package-contract",
  checks: [...tierChecks("strict"), "Prose"],
  settings: { ...tierSettings("strict"), Mutation: { minScore: 100 } },
}

/**
 * @param checks - a tier's checks.
 * @param id - the check to delete.
 * @returns a copy without that check, as a user who deletes it by hand would write.
 */
function without(checks: object, id: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(checks).filter(([key]) => key !== id))
}

describe("R1e explainTier and renderExplain", () => {
  it("explains a strict() config with no loosening against its own tier", () => {
    const explanation = explainTier(strict())
    expect(explanation).toMatchObject({
      schemaVersion: 1,
      tier: "strict",
      baseline: "strict",
      missing: [],
      loosened: [],
      planned: plannedChecks("strict"),
    })
    expect(explanation.checks.map(({ id }) => id)).toEqual(tierChecks("strict"))
    expect(explanation.checks.every(({ source, enabled }) => source === "tier" && enabled)).toBe(
      true,
    )
    const settingsOf = (id: string) => explanation.checks.find((check) => check.id === id)?.settings
    expect(settingsOf("Coverage")).toEqual({
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 80,
    })
    expect(settingsOf("Duplication")).toEqual({ maxPercentage: 0.75 })
    expect(settingsOf("Crap")).toEqual({ threshold: 30, maxComplexity: 20 })
    expect(settingsOf("Mutation")).toEqual({ minScore: 80 })
    expect(settingsOf("Format")).toEqual({})
  })

  it("lists a lowered coverage threshold as loosened with its baseline and value", () => {
    const explanation = explainTier(strict({ Coverage: { thresholds: { branches: 70 } } }))
    const loosening = { check: "Coverage", setting: "branches", baseline: 80, value: 70 }
    expect(explanation.loosened).toEqual([loosening])
    expect(explanation.checks.find(({ id }) => id === "Coverage")?.loosened).toEqual([loosening])
  })

  it("lists a coverage metric no longer judged as loosened, with value undefined", () => {
    expect(
      explainTier(strict({ Coverage: { thresholds: { functions: undefined } } })).loosened,
    ).toEqual([{ check: "Coverage", setting: "functions", baseline: 80, value: undefined }])
  })

  it("lists a raised duplication budget as loosened", () => {
    expect(explainTier(app({ Duplication: { maxPercentage: 5 } })).loosened).toEqual([
      { check: "Duplication", setting: "maxPercentage", baseline: 2, value: 5 },
    ])
  })

  it("lists nothing when every change is stricter", () => {
    expect(
      explainTier(
        strict({
          Mutation: { minScore: 100 },
          Crap: { threshold: 15 },
          Duplication: { maxPercentage: 0 },
        }),
      ).loosened,
    ).toEqual([])
  })

  it("lists a check turned off with false as loosened (setting enabled)", () => {
    const explanation = explainTier(strict({ Commits: false, Coverage: false }))
    expect(explanation.loosened).toEqual([
      { check: "Coverage", setting: "enabled", baseline: true, value: false },
      { check: "Commits", setting: "enabled", baseline: true, value: false },
    ])
    expect(explanation.checks.find(({ id }) => id === "Commits")?.enabled).toBe(false)
    expect(explanation.missing).toEqual([])
  })

  it("lists a baseline check deleted from checks under missing and as loosened", () => {
    const config = strict()
    const checks = without(config.checks, "Mutation")
    const explanation = explainTier({ checks, tier: config.tier })
    expect(explanation.missing).toEqual(["Mutation"])
    expect(explanation.loosened).toEqual([
      { check: "Mutation", setting: "enabled", baseline: true, value: false },
    ])
    expect(explanation.checks.map(({ id }) => id)).not.toContain("Mutation")
  })

  it("marks a check the tier does not contain as source added, with no settings", () => {
    const config = app()
    const explanation = explainTier({
      checks: { ...config.checks, Mutation: HAND_WRITTEN },
      tier: config.tier,
    })
    expect(explanation.checks.at(-1)).toEqual({
      id: "Mutation",
      source: "added",
      enabled: true,
      settings: {},
      loosened: [],
    })
  })

  it("explains a config with no tier metadata against an explicit baseline", () => {
    const explanation = explainTier({ checks: { Format: HAND_WRITTEN } }, tierBaseline("basic"))
    expect(explanation).toMatchObject({
      tier: undefined,
      baseline: "basic",
      missing: ["Lint", "Typecheck", "Tests", "SecuritySecrets", "SecurityDeps"],
      planned: [],
    })
    expect(explanation.checks).toEqual([
      { id: "Format", source: "tier", enabled: true, settings: {}, loosened: [] },
    ])
    expect(explanation.loosened.map(({ check, setting }) => `${check}.${setting}`)).toEqual([
      "Lint.enabled",
      "Typecheck.enabled",
      "Tests.enabled",
      "SecuritySecrets.enabled",
      "SecurityDeps.enabled",
    ])
  })

  it("compares no settings when the config carries no tier metadata", () => {
    const { checks } = strict({ Coverage: { thresholds: { branches: 10 } } })
    expect(explainTier({ checks }, tierBaseline("strict")).loosened).toEqual([])
  })

  it("returns tier undefined and baseline undefined for a config with neither", () => {
    expect(explainTier({ checks: { Format: HAND_WRITTEN } })).toEqual({
      schemaVersion: 1,
      tier: undefined,
      baseline: undefined,
      checks: [{ id: "Format", source: "added", enabled: true, settings: {}, loosened: [] }],
      missing: [],
      loosened: [],
      planned: [],
    })
  })

  it("treats malformed tier metadata as none", () => {
    for (const tier of [null, "strict", { name: "fleet" }, { name: "strict", settings: null }]) {
      const explanation = explainTier({ checks: { Format: HAND_WRITTEN }, tier })
      expect(explanation.tier, JSON.stringify(tier)).toBeUndefined()
      expect(explanation.baseline, JSON.stringify(tier)).toBeUndefined()
    }
  })

  it("treats metadata naming no tier as none, even when its other fields are well formed", () => {
    const tier = { name: "fleet", checks: ["Format"], off: [], settings: {} }
    const explanation = explainTier({ checks: { Format: HAND_WRITTEN }, tier })
    expect(explanation.tier).toBeUndefined()
    expect(explanation.baseline).toBeUndefined()
  })

  it("keeps only a check's numeric settings, so a metric an override unset is not listed", () => {
    const explanation = explainTier(strict({ Coverage: { thresholds: { functions: undefined } } }))
    const coverage = explanation.checks.find(({ id }) => id === "Coverage")
    expect(Object.keys(coverage?.settings ?? {})).toEqual(["lines", "statements", "branches"])
  })

  it("judges each check by its own loosening rules, whatever else its baseline group holds", () => {
    const strictSettings = tierSettings("strict")
    const baseline: ExplainBaseline = {
      ...tierBaseline("strict"),
      settings: { ...strictSettings, Crap: { ...strictSettings.Crap, minScore: 100 } as never },
    }
    expect(explainTier(strict(), baseline).loosened).toEqual([])
  })

  it("counts every setting as stricter when the baseline sets nothing for that check", () => {
    const withoutCrap = Object.fromEntries(
      Object.entries(tierSettings("strict")).filter(([id]) => id !== "Crap"),
    )
    const baseline = {
      ...tierBaseline("strict"),
      settings: withoutCrap,
    } as unknown as ExplainBaseline
    expect(explainTier(strict(), baseline).loosened).toEqual([])
  })

  it("tierBaseline(name) carries the tier's checks, settings and planned checks", () => {
    expect(tierBaseline("library")).toEqual({
      name: "library",
      checks: tierChecks("library"),
      settings: tierSettings("library"),
      planned: plannedChecks("library"),
    })
  })

  it("compares against a supplied baseline, as IPC does for its Loosened section", () => {
    const explanation = explainTier(strict(), IPC_BASELINE)
    expect(explanation.baseline).toBe("internal-package-contract")
    expect(explanation.tier).toBe("strict")
    expect(explanation.missing).toEqual(["Prose"])
    expect(explanation.loosened).toEqual([
      { check: "Mutation", setting: "minScore", baseline: 100, value: 80 },
      { check: "Prose", setting: "enabled", baseline: true, value: false },
    ])
    expect(explanation.planned).toBe(IPC_BASELINE.planned)
  })

  it("renderExplain text lists each check, then a Loosened heading, then planned checks", () => {
    const config = app({ Duplication: { maxPercentage: 5 }, DeadCode: false })
    const explanation = explainTier({
      checks: { ...config.checks, Sbom: HAND_WRITTEN },
      tier: config.tier,
    })
    expect(renderExplain(explanation)).toMatchInlineSnapshot(`
      "Tier app, compared with app.

      Checks:
        Format
        Lint
        Typecheck
        Tests
        SecuritySecrets
        SecurityDeps
        Build
        DeadCode         off
        Duplication      maxPercentage 5
        Licenses
        DocsLinks
        Coverage         lines 80, statements 80
        Sbom             added

      Loosened:
        DeadCode: turned off (baseline runs it)
        Duplication maxPercentage: 5 (baseline 2)

      Planned for a later release:
        DocsFragments (app): Every \`#anchor\` link resolves to a heading, because a broken anchor is a broken link.
        GithubActions (app): Every workflow file passes actionlint, and a repository with no workflows passes.
        GitHygiene (app): No tracked build output, no conflict markers and no import of an untracked file reach a commit.
      "
    `)
  })

  it("renderExplain separates a check's status from its settings with a semicolon", () => {
    const text = renderExplain(explainTier(app({ Duplication: false })))
    expect(text).toContain("  Duplication      off; maxPercentage 2\n")
  })

  it("renderExplain names deleted checks and unjudged metrics in the loosened list", () => {
    const config = strict({ Coverage: { thresholds: { functions: undefined } } })
    const checks = without(config.checks, "Mutation")
    const text = renderExplain(explainTier({ checks, tier: config.tier }))
    expect(text).toContain("  Coverage functions: not judged (baseline 80)\n")
    expect(text).toContain("  Mutation: not in checks (baseline runs it)\n")
  })

  it("renderExplain markdown uses the heading option over the loosened list", () => {
    const config = basic({ SecurityDeps: false })
    const checks = without(config.checks, "Lint")
    expect(
      renderExplain(explainTier({ checks, tier: config.tier }), {
        format: "markdown",
        heading: "Loosened against basic",
      }),
    ).toMatchInlineSnapshot(`
      "Tier \`basic\`, compared with \`basic\`.

      | Check | Status and settings |
      | --- | --- |
      | Format |  |
      | Typecheck |  |
      | Tests |  |
      | SecuritySecrets |  |
      | SecurityDeps | off |

      ### Loosened against basic

      - SecurityDeps: turned off (baseline runs it)
      - Lint: not in checks (baseline runs it)
      "
    `)
  })

  it("renderExplain markdown lists settings and planned checks", () => {
    expect(
      renderExplain(explainTier(app({ Coverage: { thresholds: { lines: 70 } } })), {
        format: "markdown",
      }),
    ).toMatchInlineSnapshot(`
      "Tier \`app\`, compared with \`app\`.

      | Check | Status and settings |
      | --- | --- |
      | Format |  |
      | Lint |  |
      | Typecheck |  |
      | Tests |  |
      | SecuritySecrets |  |
      | SecurityDeps |  |
      | Build |  |
      | DeadCode |  |
      | Duplication | maxPercentage 2 |
      | Licenses |  |
      | DocsLinks |  |
      | Coverage | lines 70, statements 80 |

      ### Loosened

      - Coverage \`lines\`: 70 (baseline 80)

      ### Planned for a later release

      - **DocsFragments** (app): Every \`#anchor\` link resolves to a heading, because a broken anchor is a broken link.
      - **GithubActions** (app): Every workflow file passes actionlint, and a repository with no workflows passes.
      - **GitHygiene** (app): No tracked build output, no conflict markers and no import of an untracked file reach a commit.
      "
    `)
  })

  it("renderExplain says nothing is loosened when the list is empty", () => {
    expect(renderExplain(explainTier(basic()))).toMatchInlineSnapshot(`
      "Tier basic, compared with basic.

      Checks:
        Format
        Lint
        Typecheck
        Tests
        SecuritySecrets
        SecurityDeps

      Loosened:
        Nothing is loosened.
      "
    `)
  })

  it("renderExplain says what it compared when there is no tier or no baseline", () => {
    expect(renderExplain(explainTier({ checks: { Format: HAND_WRITTEN } }))).toMatchInlineSnapshot(`
      "No tier metadata and no baseline, so nothing is compared.

      Checks:
        Format  added

      Loosened:
        Nothing is loosened.
      "
    `)
    expect(
      renderExplain(explainTier({ checks: { Format: HAND_WRITTEN } }, tierBaseline("basic"))).split(
        "\n",
      )[0],
    ).toMatchInlineSnapshot(`"No tier metadata: checks are compared with basic, settings are not."`)
  })
})
