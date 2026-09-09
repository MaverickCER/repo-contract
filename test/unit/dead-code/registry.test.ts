import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  DEAD_CODE_EXCEPTION_SCHEMA,
  createDeadCodeStub,
} from "../../../scripts/dead-code/registry.js"
import { deriveDeadCodeId } from "../../../scripts/dead-code/evidence-types.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, DEAD_CODE_EXCEPTION_SCHEMA)

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const kind = (overrides.kind as string | undefined) ?? "unused-dev-dependency"
  const name = (overrides.name as string | undefined) ?? "oxlint"
  return {
    id: deriveDeadCodeId({ kind: kind as never, name }),
    version: 1,
    justification: "Spawned by name, never imported; knip cannot see the use.",
    kind,
    name,
    ...overrides,
  }
}

describe("deriveDeadCodeId / createDeadCodeStub", () => {
  it("joins the namespace, kind, and name", () => {
    expect(deriveDeadCodeId({ kind: "unused-export", name: "foo" })).toBe(
      "dead-code:unused-export:foo",
    )
  })

  it("scaffolds a blank stub carrying the id, kind, and name", () => {
    const f = {
      id: "dead-code:unused-export:foo",
      kind: "unused-export" as const,
      name: "foo",
      file: "src/a.ts",
      location: ":3:1",
    }
    expect(createDeadCodeStub(f, f.id)).toEqual({
      id: "dead-code:unused-export:foo",
      version: 1,
      justification: "",
      kind: "unused-export",
      name: "foo",
    })
  })
})

describe("DEAD_CODE_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record", () => {
    const result = validate([valid()])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })

  it.each([
    ["a foreign namespace", { id: "suppression:x" }],
    ["a bogus kind", { kind: "made-up" }],
    ["an empty name", { name: "" }],
    ["version !== 1", { version: 2 }],
    ["an unknown field", { extra: 1 }],
  ])("rejects %s", (_desc, override) => {
    expect(validate([valid(override)]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own kind/name", () => {
    const result = validate([valid({ id: "dead-code:unused-export:other" })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match the id derived")
  })

  it("rejects a duplicate id across two records", () => {
    expect(validate([valid(), valid()]).ok).toBe(false)
  })

  it("the committed dead-code.json validates", () => {
    const parsed = JSON.parse(
      readFileSync(
        new URL("../../../.repo-contract/exceptions/dead-code.json", import.meta.url),
        "utf8",
      ),
    ) as { exceptions: unknown }
    const result = validate(parsed.exceptions as readonly unknown[])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })
})
