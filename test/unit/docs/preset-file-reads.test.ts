import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * GUIDE.md "Regression detection" and the `./presets` environment in docs/surface.json name the
 * presets that read their own report file in-process. This test derives that list from the preset
 * sources, so adding or removing a `node:fs` import fails here until both documents follow.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const presetsDir = path.join(root, "src/presets")

/** @returns The export name of each preset module that imports `node:fs` at the top level. */
function presetsReadingFiles(): string[] {
  return readdirSync(presetsDir)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts")
    .filter((file) =>
      /^import [^\n]* from "node:fs(\/promises)?"/m.test(
        readFileSync(path.join(presetsDir, file), "utf8"),
      ),
    )
    .map((file) =>
      file
        .slice(0, -".ts".length)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    )
    .sort()
}

/** @returns Every backticked identifier in `text`, sorted. */
function namesIn(text: string): string[] {
  return [...text.matchAll(/`([A-Za-z]+)`/g)].map((match) => match[1] ?? "").sort()
}

describe("presets that read their own report file", () => {
  const expected = presetsReadingFiles()

  it("finds the presets that import node:fs", () => {
    expect(expected).toEqual(["duplication", "markdownlint", "securitySecrets", "test"])
  })

  it("are the presets GUIDE.md names", () => {
    const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
    const paragraph = guide.split("\n").find((line) => line.includes("published presets ("))
    expect(paragraph).toBeDefined()
    const list = /published presets \(([^)]*)\)/.exec(paragraph ?? "")?.[1] ?? ""
    expect(namesIn(list)).toEqual(expected)
  })

  it("are the presets docs/surface.json names", () => {
    const surface = JSON.parse(readFileSync(path.join(root, "docs/surface.json"), "utf8")) as {
      entries: Record<string, { environment: string }>
    }
    const environment = surface.entries["./presets"]?.environment ?? ""
    expect(namesIn(environment)).toEqual(expected)
  })
})
