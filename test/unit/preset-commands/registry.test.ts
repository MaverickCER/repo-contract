import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  PRESET_COMMAND_EXCEPTION_SCHEMA,
  createPresetCommandStub,
} from "../../../scripts/preset-commands/registry.js"
import { derivePresetCommandId } from "../../../scripts/preset-commands/evidence-types.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, PRESET_COMMAND_EXCEPTION_SCHEMA)

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const command = (overrides.command as string | undefined) ?? "eslint"
  return {
    id: derivePresetCommandId({ command }),
    version: 1,
    justification: "Reviewed: no network; node_modules-only plugin resolution.",
    command,
    ...overrides,
  }
}

describe("derivePresetCommandId / createPresetCommandStub", () => {
  it("keys by the command name alone", () => {
    expect(derivePresetCommandId({ command: "tsc" })).toBe("preset-command:tsc")
  })

  it("scaffolds a blank stub carrying the id and command", () => {
    const f = {
      id: "preset-command:tsc",
      command: "tsc",
      file: "src/presets/typecheck.ts",
      line: 8,
    }
    expect(createPresetCommandStub(f, f.id)).toEqual({
      id: "preset-command:tsc",
      version: 1,
      justification: "",
      command: "tsc",
    })
  })
})

describe("PRESET_COMMAND_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record", () => {
    expect(validate([valid()]).ok).toBe(true)
  })

  it.each([
    ["a foreign namespace", { id: "suppression:x" }],
    ["a command with a space", { command: "curl x" }],
    ["a command with a shell metacharacter", { command: "sh;rm" }],
    ["version !== 1", { version: 2 }],
    ["an unknown field", { extra: 1 }],
  ])("rejects %s", (_desc, override) => {
    expect(validate([valid(override)]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own command", () => {
    const result = validate([valid({ id: "preset-command:prettier" })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match the id derived")
  })

  it("rejects a duplicate id across two records", () => {
    expect(validate([valid(), valid()]).ok).toBe(false)
  })

  it("the committed preset-commands.json validates", () => {
    const parsed = JSON.parse(
      readFileSync(
        new URL("../../../.repo-contract/exceptions/preset-commands.json", import.meta.url),
        "utf8",
      ),
    ) as { exceptions: unknown }
    const result = validate(parsed.exceptions as readonly unknown[])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })
})
