import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as presets from "../../../src/presets/index.js"
import type { CheckDefinitionConfig } from "../../../src/types.js"
import {
  AGENT_COMMAND,
  DIST_OUTPUT,
  FACTORY_PRESETS,
  PRESET_DEPENDENCIES,
} from "../../../bin/preset-catalog.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

interface GuidePresetRow {
  readonly name: string
  readonly factory: boolean
  /** `options` when the table writes `name(options)`: the factory has a required option. */
  readonly parameter: string | undefined
  readonly wrapsCell: string
  readonly packageCell: string
}

/** The rows of the first table under GUIDE.md's "## Presets" heading. */
function guidePresetRows(): GuidePresetRow[] {
  const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
  const section = guide.slice(guide.indexOf("\n## Presets"))
  const rows = section.split("\n").filter((line) => line.startsWith("|"))
  const result: GuidePresetRow[] = []
  for (const row of rows.slice(2)) {
    const cells = row.split("|").map((cell) => cell.trim())
    const match = /^`([A-Za-z][A-Za-z0-9]*)(\(([^)]*)\))?`$/.exec(cells[2] ?? "")
    if (match?.[1] === undefined) break
    result.push({
      name: match[1],
      factory: match[2] !== undefined,
      parameter: match[3],
      wrapsCell: cells[3] ?? "",
      packageCell: cells[4] ?? "",
    })
  }
  return result
}

/**
 * @param dependency - One `PRESET_DEPENDENCIES` value.
 * @returns The "Package `init` detects" cell GUIDE.md must show for it.
 */
function expectedPackageCell(dependency: string | null): string {
  if (dependency === null) return "none (`npm`)"
  if (dependency === DIST_OUTPUT) return "none (a built `dist/`)"
  if (dependency === AGENT_COMMAND) return "none (the agent you name)"
  return `\`${dependency}\``
}

/**
 * The options a factory with a required option is called with, so its "Wraps" cell can show it.
 * Each value is itself the placeholder the table shows, so the comparison stays exact.
 */
const REQUIRED_OPTIONS: Readonly<Record<string, unknown>> = {
  aiReview: { agent: ["<agent>"] },
}

/**
 * @param name - An export of `repo-contract/presets`.
 * @returns The preset's definition; a factory is called with no options, so its defaults show,
 * or with its `REQUIRED_OPTIONS` entry.
 */
function presetDefinition(name: string): CheckDefinitionConfig {
  const preset = (presets as Record<string, unknown>)[name]
  return typeof preset === "function"
    ? (preset as (options?: unknown) => CheckDefinitionConfig)(REQUIRED_OPTIONS[name])
    : (preset as CheckDefinitionConfig)
}

/**
 * The command a preset runs, as GUIDE.md's "Wraps" column names it. `license` runs `node -e` with a
 * launcher that starts licensee in-process, so the command it wraps is that package and the
 * arguments the launcher hands it.
 * @param run - A preset's `run`.
 * @returns The wrapped command's words.
 */
function wrappedCommand(run: CheckDefinitionConfig["run"]): string[] {
  const words = typeof run === "string" ? run.split(" ") : [...run]
  const script = words[0] === "node" && words[1] === "-e" ? (words[2] ?? "") : ""
  const tool = /require\.resolve\("([^"]+)\/package\.json"/.exec(script)?.[1]
  const argv = /process\.argv = \[process\.argv\[0\], binPath, ([^\]]*)\]/.exec(script)?.[1]
  if (tool === undefined || argv === undefined) return words
  const literals = argv
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.startsWith('"'))
    .map((word) => JSON.parse(word) as string)
  return [tool, ...literals]
}

/**
 * @param shown - The words of the first code span in a "Wraps" cell.
 * @param actual - The words of the command the preset runs.
 * @returns Whether they agree. A `<placeholder>` word stands for one option-dependent word, but
 * never for the tool itself.
 */
function sameCommand(shown: readonly string[], actual: readonly string[]): boolean {
  return (
    shown.length === actual.length &&
    shown.every((word, index) =>
      index > 0 && /^<[^>]+>$/.test(word) ? true : word === actual[index],
    )
  )
}

describe("GUIDE.md's preset table", () => {
  it("lists exactly the presets repo-contract/presets exports", () => {
    const names = guidePresetRows().map((row) => row.name)
    expect(names.sort()).toEqual(Object.keys(presets).sort())
  })

  it("shows the package `repo-contract init` detects for each preset, as bin/preset-catalog.mjs maps it", () => {
    const dependencies: Record<string, string | null> = PRESET_DEPENDENCIES
    const shown = Object.fromEntries(guidePresetRows().map((row) => [row.name, row.packageCell]))
    const expected = Object.fromEntries(
      Object.entries(dependencies).map(([name, dependency]) => [
        name,
        expectedPackageCell(dependency),
      ]),
    )
    expect(shown).toEqual(expected)
  })

  it("writes `name(options?)` for exactly the factory presets bin/preset-catalog.mjs lists", () => {
    const factories = guidePresetRows()
      .filter((row) => row.factory)
      .map((row) => row.name)
    expect(factories.sort()).toEqual([...FACTORY_PRESETS].sort())
  })

  it("writes `name(options)`, with no `?`, for exactly the presets that require an option", () => {
    const shown = guidePresetRows().flatMap((row) =>
      row.parameter === "options" ? [row.name] : [],
    )
    expect(shown.sort()).toEqual(Object.keys(REQUIRED_OPTIONS).sort())
    const unknown = guidePresetRows().filter(
      (row) => row.parameter !== undefined && !["options", "options?"].includes(row.parameter),
    )
    expect(unknown).toEqual([])
  })

  it("shows, under Wraps, the command each preset runs with its default options", () => {
    const mismatches = guidePresetRows().flatMap((row) => {
      const shown = /`([^`]+)`/.exec(row.wrapsCell)?.[1] ?? ""
      const actual = wrappedCommand(presetDefinition(row.name).run)
      return sameCommand(shown.split(" "), actual)
        ? []
        : [`${row.name}: GUIDE.md shows \`${shown}\`, the preset runs \`${actual.join(" ")}\``]
    })
    expect(mismatches).toEqual([])
  })

  it("names under Wraps only extra flags the preset can pass", () => {
    const unknown = guidePresetRows().flatMap((row) => {
      const extras = [...row.wrapsCell.matchAll(/`([^`]+)`/g)]
        .slice(1)
        .map((span) => span[1] ?? "")
        .filter((span) => span.startsWith("-"))
      const run = presetDefinition(row.name).run
      const source = typeof run === "string" ? run : run.join(" ")
      return extras
        .filter((flag) => !source.includes(JSON.stringify(flag)))
        .map((flag) => `${row.name}: ${flag}`)
    })
    expect(unknown).toEqual([])
  })
})

describe("GUIDE.md's AI review checks section", () => {
  it("shows the JSON example the aiReview preset's default prompt sends", () => {
    const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
    const section = guide.slice(
      guide.indexOf("\n## AI review checks"),
      guide.indexOf("\n## Presets"),
    )
    const shown = /```json\n([\s\S]*?)```/.exec(section)?.[1] ?? ""
    const prompt = (presets.aiReview({ agent: ["agent"] }).run as readonly string[])[1] ?? ""
    // The example runs from the prompt's first `{` to the `}` that ends its own line.
    const sent = prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}\n") + 1)
    expect(JSON.parse(shown)).toEqual(JSON.parse(sent))
  })
})
