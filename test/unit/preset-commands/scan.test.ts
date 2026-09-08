import { describe, expect, it } from "vitest"
import { scanPresetModule } from "../../../scripts/preset-commands/scan.js"

describe("scanPresetModule", () => {
  it("extracts the command from a plain string-literal run array", () => {
    const { commands, nonLiteral } = scanPresetModule(
      "src/presets/x.ts",
      'export const x = { run: ["eslint", path, "--format", "json"] }',
    )
    expect(nonLiteral).toEqual([])
    expect(commands).toEqual([{ command: "eslint", file: "src/presets/x.ts", line: 1 }])
  })

  it("sees through `as const` and `satisfies` on the run array", () => {
    for (const src of [
      'export const x = { run: ["tsc", "--noEmit"] as const }',
      'export const x = { run: ["tsc", "--noEmit"] satisfies readonly string[] }',
    ]) {
      const { commands } = scanPresetModule("src/presets/x.ts", src)
      expect(commands[0]?.command).toBe("tsc")
    }
  })

  it("resolves a no-substitution template-literal run command", () => {
    const { commands } = scanPresetModule(
      "src/presets/x.ts",
      "export const x = { run: `prettier --write .` }",
    )
    expect(commands[0]?.command).toBe("prettier")
  })

  it("ignores an empty run array (spawns nothing)", () => {
    const { commands, nonLiteral } = scanPresetModule(
      "src/presets/x.ts",
      "export const x = { run: [] }",
    )
    expect(commands).toEqual([])
    expect(nonLiteral).toEqual([])
  })

  it.each([
    [
      "a first element that isn't a literal",
      'export function b(cmd: string) { return { run: [cmd, "x"] } }',
    ],
    [
      "an interpolated template literal",
      "export function b(cmd: string) { return { run: `${cmd} x` } }",
    ],
    [
      "a bare identifier value",
      "declare const RUN: readonly string[]\nexport const x = { run: RUN }",
    ],
    ["shorthand syntax", "declare const run: readonly string[]\nexport const x = { run }"],
  ])("reports %s as non-literal", (_desc, src) => {
    const { commands, nonLiteral } = scanPresetModule("src/presets/x.ts", src)
    expect(commands).toEqual([])
    expect(nonLiteral).toHaveLength(1)
  })

  it('handles a quoted "run" key the same as an unquoted one', () => {
    const { commands } = scanPresetModule(
      "src/presets/x.ts",
      'export const x = { "run": ["vitest", "run"] }',
    )
    expect(commands[0]?.command).toBe("vitest")
  })
})
