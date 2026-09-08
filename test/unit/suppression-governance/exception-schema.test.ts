import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  SUPPRESSION_EXCEPTION_SCHEMA,
  deriveSuppressionId,
  validateExceptionRegistry,
} from "../../../scripts/suppression-governance/evidence-types.js"

/**
 * `validateExceptionRegistry` (scripts/shared/exception-record.ts) + `SUPPRESSION_EXCEPTION_SCHEMA`
 * are the sole runtime gate on `.repo-contract/exceptions/disable-comments.json`. These cases pin
 * the core rules (id namespace, `version === 1`, unknown-field rejection, id uniqueness) and the
 * suppression-specific rules (typed metadata, id self-consistency), and prove the real committed
 * registry validates.
 */

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const identity = {
    domain: (overrides.domain as string | undefined) ?? "eslint",
    rule: (overrides.rule as string[] | undefined) ?? ["no-console"],
    file: (overrides.file as string | undefined) ?? "src/example.ts",
    line: (overrides.line as number | undefined) ?? 10,
  }
  return {
    id: deriveSuppressionId(identity),
    version: 1,
    justification: "",
    category: "",
    domain: identity.domain,
    file: identity.file,
    line: identity.line,
    rule: identity.rule,
    verificationMethod: "",
    ...overrides,
  }
}

describe("validateExceptionRegistry + SUPPRESSION_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed blank stub", () => {
    const result = validateExceptionRegistry([valid()], SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok).toBe(true)
  })

  it("rejects a non-array top level", () => {
    const result = validateExceptionRegistry({ nope: true }, SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok).toBe(false)
  })

  it.each<[string, Record<string, unknown>]>([
    ["a foreign id namespace", { id: "security-network:x:src/a.ts" }],
    ["version not 1", { version: 2 }],
    ["a non-string justification", { justification: 5 }],
    ["an unknown field", { extra: "nope" }],
    ["an empty rule array", { rule: [] }],
    ["a bad category", { category: "made-up" }],
    ["a bad verificationMethod", { verificationMethod: "guess" }],
    ["a '..' escaping file", { file: "../secrets.ts" }],
    ["a non-positive line", { line: 0 }],
  ])("rejects %s", (_desc, override) => {
    const result = validateExceptionRegistry([valid(override)], SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok).toBe(false)
  })

  it("rejects a record whose stored id disagrees with its own domain/rule/file/line", () => {
    const record = valid()
    record.id = "suppression:eslint:no-console:src/example.ts:999"
    const result = validateExceptionRegistry([record], SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match the id derived")
  })

  it("rejects two records sharing an id", () => {
    const result = validateExceptionRegistry([valid(), valid()], SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("reuses the id")
  })

  it("reports every problem found, not just the first", () => {
    const result = validateExceptionRegistry(
      [valid({ line: 0 }), valid({ category: "bogus", file: "src/other.ts" })],
      SUPPRESSION_EXCEPTION_SCHEMA,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })

  it("the real, committed disable-comments.json validates", () => {
    const parsed = JSON.parse(
      readFileSync(
        new URL("../../../.repo-contract/exceptions/disable-comments.json", import.meta.url),
        "utf8",
      ),
    ) as { exceptions: unknown }
    const result = validateExceptionRegistry(parsed.exceptions, SUPPRESSION_EXCEPTION_SCHEMA)
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })
})
