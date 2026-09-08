import { describe, expect, it } from "vitest"
import {
  reconcileExceptions,
  serializeExceptionRegistry,
} from "../../../src/helpers/reconcile-exceptions.js"

interface Finding {
  readonly rule: string
  readonly file: string
  readonly line: number
}

interface Record {
  readonly id: string
  readonly version: number
  readonly justification: string
  readonly rule: readonly string[]
}

const deriveId = (finding: Finding): string => `suppression:eslint:${finding.rule}:${finding.file}`

const createStub = (finding: Finding, id: string): Record => ({
  id,
  version: 1,
  justification: "",
  rule: [finding.rule],
})

function ok<T extends { readonly ok: true }>(
  result: T | { readonly ok: false; readonly error: string },
): T {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result
}

describe("reconcileExceptions", () => {
  it("matches an existing record by id and returns it verbatim", () => {
    const existing: Record[] = [
      {
        id: "suppression:eslint:no-eval:b.ts",
        version: 1,
        justification: "reviewed",
        rule: ["no-eval"],
      },
    ]
    const findings: Finding[] = [{ rule: "no-eval", file: "b.ts", line: 42 }]

    const { reconciliation } = ok(reconcileExceptions({ existing, findings, deriveId, createStub }))

    expect(reconciliation.matchedPairs).toHaveLength(1)
    expect(reconciliation.matchedPairs[0]?.record).toBe(existing[0])
    expect(reconciliation.activeRecords).toEqual(existing)
    expect(reconciliation.staleRecords).toEqual([])
    expect(reconciliation.newStubIds).toEqual([])
  })

  it("scaffolds a blank stub for an unmatched finding", () => {
    const findings: Finding[] = [{ rule: "no-console", file: "a.ts", line: 1 }]

    const { reconciliation } = ok(
      reconcileExceptions({ existing: [], findings, deriveId, createStub }),
    )

    expect(reconciliation.newStubIds).toEqual(["suppression:eslint:no-console:a.ts"])
    expect(reconciliation.activeRecords).toEqual([
      {
        id: "suppression:eslint:no-console:a.ts",
        version: 1,
        justification: "",
        rule: ["no-console"],
      },
    ])
    expect(reconciliation.matchedPairs).toEqual([])
  })

  it("surfaces a stale record but never removes it from activeRecords or the persisted set", () => {
    const stale: Record = {
      id: "suppression:eslint:no-eval:gone.ts",
      version: 1,
      justification: "was here",
      rule: ["no-eval"],
    }
    const findings: Finding[] = [{ rule: "no-console", file: "a.ts", line: 1 }]

    const { reconciliation } = ok(
      reconcileExceptions({ existing: [stale], findings, deriveId, createStub }),
    )

    expect(reconciliation.staleRecords).toEqual([stale])
    expect(reconciliation.activeRecords.map((r) => r.id)).toEqual([
      "suppression:eslint:no-console:a.ts",
    ])
    // the check persists activeRecords ∪ staleRecords -- the stale one is kept on disk
    const persisted = [...reconciliation.activeRecords, ...reconciliation.staleRecords]
    expect(persisted).toContain(stale)
  })

  it("fails when deriveId is not injective over the findings", () => {
    const findings: Finding[] = [
      { rule: "no-console", file: "a.ts", line: 1 },
      { rule: "no-console", file: "a.ts", line: 9 },
    ]

    const result = reconcileExceptions({ existing: [], findings, deriveId, createStub })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(
        'deriveId is not injective: findings at index 0 and 1 both map to id "suppression:eslint:no-console:a.ts" -- every independently-governable finding must have a distinct id; make the two directives distinguishable.',
      )
    }
  })

  it("fails when createStub returns a record whose id is not the canonical id", () => {
    const findings: Finding[] = [{ rule: "no-console", file: "a.ts", line: 1 }]

    const result = reconcileExceptions({
      existing: [],
      findings,
      deriveId,
      createStub: (finding, _id) => createStub(finding, "suppression:wrong:id"),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(
        'createStub returned a record whose id "suppression:wrong:id" does not equal the canonical id "suppression:eslint:no-console:a.ts" it was given.',
      )
    }
  })

  it("preserves the fields of a matched record even when the finding's incidental data changed", () => {
    const existing: Record[] = [
      {
        id: "suppression:eslint:no-eval:b.ts",
        version: 1,
        justification: "the reviewed reason",
        rule: ["no-eval"],
      },
    ]
    const findings: Finding[] = [{ rule: "no-eval", file: "b.ts", line: 999 }]

    const { reconciliation } = ok(reconcileExceptions({ existing, findings, deriveId, createStub }))

    expect(reconciliation.activeRecords[0]?.justification).toBe("the reviewed reason")
  })
})

describe("serializeExceptionRegistry", () => {
  const records = [
    { id: "b:2", version: 1, justification: "second", rule: ["z", "a"], extra: "x" },
    { id: "a:1", version: 1, justification: "first", rule: ["b"] },
  ]

  it("sorts records ascending by id and leads each with id/version/justification", () => {
    const out = serializeExceptionRegistry(records)
    const parsed = JSON.parse(out) as { exceptions: { id: string }[] }
    expect(parsed.exceptions.map((r) => r.id)).toEqual(["a:1", "b:2"])
    // first three keys of a record are the fixed core order, then alphabetical
    expect(Object.keys(parsed.exceptions[1] as object)).toEqual([
      "id",
      "version",
      "justification",
      "extra",
      "rule",
    ])
  })

  it("is byte-stable regardless of input record order", () => {
    expect(serializeExceptionRegistry(records)).toBe(
      serializeExceptionRegistry([...records].reverse()),
    )
  })

  it("does not reorder array element values", () => {
    const out = JSON.parse(serializeExceptionRegistry(records)) as {
      exceptions: { rule: string[] }[]
    }
    expect(out.exceptions[1]?.rule).toEqual(["z", "a"])
  })

  it("orders each record's own keys (id/version/justification first, then alphabetical) and passes arrays through untouched", () => {
    const out = serializeExceptionRegistry([
      { rule: ["z", "a"], id: "x:1", extra: "e", version: 1, justification: "j" },
    ])
    const parsed = JSON.parse(out) as { exceptions: { rule: string[] }[] }
    expect(out).toBe(
      '{\n  "exceptions": [\n    {\n      "id": "x:1",\n      "version": 1,\n      "justification": "j",\n      "extra": "e",\n      "rule": [\n        "z",\n        "a"\n      ]\n    }\n  ]\n}\n',
    )
    expect(parsed.exceptions[0]?.rule).toEqual(["z", "a"])
  })

  it("ends with exactly one trailing newline and uses 2-space indent", () => {
    const out = serializeExceptionRegistry(records)
    expect(out.endsWith("}\n")).toBe(true)
    expect(out.endsWith("}\n\n")).toBe(false)
    expect(out).toContain('\n  "exceptions"')
  })

  it("serializes an empty registry deterministically", () => {
    expect(serializeExceptionRegistry([])).toBe('{\n  "exceptions": []\n}\n')
  })

  it("carries an own __proto__ key through as serialized data and never mutates a prototype", () => {
    // `JSON.parse` creates `__proto__` as an own data property; a naive `obj[key] = value` copy
    // would silently drop it (the setter ignores non-object values) or, worse, mutate the proto.
    const record = JSON.parse(
      '{"id":"x:1","version":1,"justification":"j","__proto__":"payload"}',
    ) as { [k: string]: unknown; id: string }
    const out = serializeExceptionRegistry([record])
    expect(out).toContain('"__proto__": "payload"')
    expect(Object.getPrototypeOf({}) as unknown).toBe(Object.prototype)
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })
})
