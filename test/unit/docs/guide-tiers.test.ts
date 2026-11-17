import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  plannedChecks,
  TIER_NAMES,
  tierChecks,
  tierDefinition,
  tierSettings,
} from "../../../src/tiers/index.js"
import type { TierName, TierSettings } from "../../../src/tiers/index.js"

// GUIDE.md's "## Tiers" tables restate src/tiers/catalog.ts. These cases read both, so a tier that
// gains a check or changes a default fails here until the guide says the same.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

/**
 * @returns GUIDE.md from its "## Tiers" heading up to the next level-2 heading.
 */
function tiersSection(): string {
  const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
  const start = guide.indexOf("\n## Tiers\n")
  expect(start).toBeGreaterThan(-1)
  const end = guide.indexOf("\n## ", start + 1)
  return guide.slice(start, end === -1 ? undefined : end)
}

/**
 * @param heading - The text of the table's first header cell.
 * @param nth - Which of the tables headed that way, counting from 0.
 * @returns The body rows of that table, as trimmed cells.
 */
function tableRows(heading: string, nth = 0): string[][] {
  const lines = tiersSection().split("\n")
  const header = new RegExp(`^\\|\\s*${heading}\\s*\\|`)
  const tops = lines.flatMap((line, index) => (header.test(line) ? [index] : []))
  const top = tops[nth]
  expect(top, `table ${String(nth)} headed "${heading}" under ## Tiers`).toBeDefined()
  const rows: string[][] = []
  for (const line of lines.slice((top ?? lines.length) + 2)) {
    if (!line.startsWith("|")) break
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
  }
  return rows
}

/** @returns The tier table's rows, keyed by the tier name in the first cell. */
function tierRows(): Map<string, { adds: string; defaults: string }> {
  const rows = new Map<string, { adds: string; defaults: string }>()
  for (const [name = "", , adds = "", defaults = ""] of tableRows("Tier")) {
    rows.set(name.replaceAll("`", ""), { adds, defaults })
  }
  return rows
}

/**
 * Reads a "Defaults" cell back into the settings it states. Each phrase the table uses maps to one
 * setting, so a phrase the reader cannot parse fails the case instead of passing unread.
 * @param cell - The cell's text.
 * @returns The settings the cell states, plus the tier it says to copy, if any.
 */
function parseDefaults(cell: string): {
  readonly settings: Partial<Record<keyof TierSettings, Record<string, number>>>
  readonly sameAs: string | undefined
  readonly noCoverage: boolean
} {
  const settings: Partial<Record<keyof TierSettings, Record<string, number>>> = {}
  let sameAs: string | undefined
  let noCoverage = false
  for (const phrase of cell.split(";").map((part) => part.trim())) {
    let match: RegExpExecArray | null
    if (phrase === "no coverage") noCoverage = true
    else if ((match = /^as `(\w+)`$/.exec(phrase)) !== null) sameAs = match[1]
    else if ((match = /^coverage (\d+) on all four metrics$/.exec(phrase)) !== null) {
      const floor = Number(match[1])
      settings.Coverage = { lines: floor, statements: floor, functions: floor, branches: floor }
    } else if ((match = /^coverage (\d+) on lines and statements$/.exec(phrase)) !== null) {
      settings.Coverage = { lines: Number(match[1]), statements: Number(match[1]) }
    } else if ((match = /^duplication ([\d.]+)%$/.exec(phrase)) !== null) {
      settings.Duplication = { maxPercentage: Number(match[1]) }
    } else if ((match = /^CRAP (\d+), complexity (\d+)$/.exec(phrase)) !== null) {
      settings.Crap = { threshold: Number(match[1]), maxComplexity: Number(match[2]) }
    } else if ((match = /^mutation score (\d+)$/.exec(phrase)) !== null) {
      settings.Mutation = { minScore: Number(match[1]) }
    } else {
      throw new Error(
        `GUIDE.md's tier table has a Defaults phrase this test cannot read: "${phrase}"`,
      )
    }
  }
  return { settings, sameAs, noCoverage }
}

/** The tier checks whose settings `TierSettings` holds, keyed by the setting's name. */
const SETTING_CHECKS = ["Coverage", "Duplication", "Crap", "Mutation"] as const

describe("GUIDE.md's tier tables", () => {
  it("lists the four tiers, loosest first", () => {
    expect([...tierRows().keys()]).toEqual([...TIER_NAMES])
  })

  it.each(TIER_NAMES)("shows what %s adds, so its checks are the tiers below plus that", (name) => {
    const shown = tierRows()
      .get(name)
      ?.adds.split(",")
      .map((id) => id.trim())
    expect(shown).toEqual([...tierDefinition(name).adds])
    const below = tierDefinition(name).extends
    expect([...(below === undefined ? [] : tierChecks(below)), ...(shown ?? [])]).toEqual([
      ...tierChecks(name),
    ])
  })

  it.each(TIER_NAMES)("states %s's defaults for every setting check it runs", (name) => {
    const row = tierRows().get(name)
    expect(row).toBeDefined()
    const parsed = parseDefaults(row?.defaults ?? "")
    const runs = new Set<string>(tierChecks(name))
    const actual = tierSettings(name)

    expect(parsed.noCoverage).toBe(!runs.has("Coverage"))
    if (parsed.sameAs !== undefined) {
      expect(actual).toEqual(tierSettings(parsed.sameAs as TierName))
      return
    }
    for (const check of SETTING_CHECKS) {
      if (!runs.has(check)) {
        expect(parsed.settings[check], `${name} runs no ${check}`).toBeUndefined()
        continue
      }
      const below = tierDefinition(name).extends
      const unchanged =
        below !== undefined &&
        new Set<string>(tierChecks(below)).has(check) &&
        JSON.stringify(tierSettings(below)[check]) === JSON.stringify(actual[check])
      // A setting the tier below already ran with the same value may go unstated.
      if (parsed.settings[check] === undefined && unchanged) continue
      expect(parsed.settings[check], `${name}'s ${check} default`).toEqual(actual[check])
    }
  })

  it("lists strict's checks in the order they run", () => {
    expect(tableRows("Check").map(([check = ""]) => check)).toEqual([...tierChecks("strict")])
  })

  it("lists each tier's planned checks under the tier that owns them", () => {
    const shown = tableRows("Tier", 1).map(([tier = "", checks = ""]) => ({
      tier: tier.replaceAll("`", ""),
      ids: checks.split(",").map((id) => id.trim()),
    }))
    const expected = TIER_NAMES.map((name) => ({
      tier: name,
      ids: tierDefinition(name).planned.map((check) => check.id),
    })).filter(({ ids }) => ids.length > 0)
    expect(shown).toEqual(expected)
    expect(shown.flatMap(({ ids }) => ids)).toEqual(
      plannedChecks("strict").map((check) => check.id),
    )
  })
})
