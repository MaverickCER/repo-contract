import { describe, expect, it } from "vitest"
import {
  findMutantById,
  mutationExceptionId,
  resolveMutants,
} from "../../../src/affected/mutation-report.js"
import type { ResolvedMutant } from "../../../src/affected/mutation-report.js"

const SOURCE = ["const a = 1", "if (a > 0) {", "  run(a)", "}"].join("\n")

const loc = (sl: number, sc: number, el: number, ec: number) => ({
  start: { line: sl, column: sc },
  end: { line: el, column: ec },
})

function resolved(report: unknown): readonly ResolvedMutant[] {
  const result = resolveMutants(report)
  if (!result.ok) throw new Error(result.error)
  return result.mutants
}

describe("resolveMutants", () => {
  it("reads every mutant with its original source span", () => {
    const mutants = resolved({
      schemaVersion: "2",
      files: {
        "src/a.ts": {
          source: SOURCE,
          mutants: [
            {
              id: "1",
              mutatorName: "EqualityOperator",
              replacement: "a >= 0",
              status: "Killed",
              location: loc(2, 5, 2, 10),
              testsCompleted: 3,
            },
            {
              id: "2",
              mutatorName: "BlockStatement",
              replacement: "{}",
              status: "Ignored",
              statusReason: "Ignored using a comment",
              location: loc(2, 12, 4, 2),
            },
          ],
        },
        "src/b.ts": {
          source: "x",
          mutants: [{ mutatorName: "StringLiteral", replacement: '""', status: "Survived" }],
        },
      },
    })
    expect(mutants).toEqual([
      {
        file: "src/a.ts",
        status: "Killed",
        mutator: "EqualityOperator",
        original: "a > 0",
        replacement: "a >= 0",
        line: 2,
        column: 5,
        statusReason: undefined,
        testsCompleted: 3,
      },
      {
        file: "src/a.ts",
        status: "Ignored",
        mutator: "BlockStatement",
        original: "{\n  run(a)\n}",
        replacement: "{}",
        line: 2,
        column: 12,
        statusReason: "Ignored using a comment",
        testsCompleted: undefined,
      },
      {
        file: "src/b.ts",
        status: "Survived",
        mutator: "StringLiteral",
        original: "",
        replacement: '""',
        line: 0,
        column: 0,
        statusReason: undefined,
        testsCompleted: undefined,
      },
    ])
  })

  it("handles a multi-line span and an out-of-range location", () => {
    const [multi, beyond, beyondEnd, beyondStart, noSource] = resolved({
      files: {
        "src/a.ts": {
          source: SOURCE,
          mutants: [
            { mutatorName: "M", replacement: "r", status: "Killed", location: loc(1, 7, 3, 5) },
            { mutatorName: "M", replacement: "r", status: "Killed", location: loc(9, 1, 9, 3) },
            { mutatorName: "M", replacement: "r", status: "Killed", location: loc(4, 1, 9, 3) },
            { mutatorName: "M", replacement: "r", status: "Killed", location: loc(7, 1, 9, 3) },
          ],
        },
        "src/c.ts": {
          mutants: [
            { mutatorName: "M", replacement: "r", status: "Killed", location: loc(1, 1, 1, 2) },
          ],
        },
      },
    })
    expect(multi?.original).toBe("a = 1\nif (a > 0) {\n  ru")
    expect(beyond?.original).toBe("")
    expect(beyondEnd?.original).toBe("}\n")
    // A multi-line span that starts past the end reads its missing lines as empty.
    expect(beyondStart?.original).toBe("\n")
    expect(noSource?.original).toBe("")
  })

  it("defaults a missing mutator name or replacement to the empty string", () => {
    const [mutant] = resolved({
      files: { "a.ts": { source: "", mutants: [{ status: "Killed" }] } },
    })
    expect(mutant).toMatchObject({ mutator: "", replacement: "" })
  })

  it("reads a non-string mutator name, replacement or status reason as absent", () => {
    const [mutant] = resolved({
      files: {
        "a.ts": {
          source: 7,
          mutants: [
            {
              status: "Killed",
              mutatorName: 5,
              replacement: ["r"],
              statusReason: 3,
              location: loc(1, 1, 1, 2),
            },
          ],
        },
      },
    })
    expect(mutant).toMatchObject({ mutator: "", replacement: "", original: "" })
    expect(mutant?.statusReason).toBeUndefined()
  })

  it.each([
    ["a line that is not a number", { line: "1", column: 1 }],
    ["a column that is not a number", { line: 1, column: "1" }],
    ["a position that is null", null],
    ["a position that is an array", [1, 1]],
  ])("drops a location whose start has %s", (_label, start) => {
    const [mutant] = resolved({
      files: {
        "a.ts": {
          source: SOURCE,
          mutants: [{ status: "Killed", location: { start, end: { line: 1, column: 6 } } }],
        },
      },
    })
    expect(mutant).toMatchObject({ line: 0, column: 0, original: "" })
  })

  it("reads a whole-number testsCompleted and drops anything else", () => {
    const mutants = resolved({
      files: {
        "a.ts": {
          mutants: [
            { status: "Survived", testsCompleted: 0 },
            { status: "Survived", testsCompleted: "3" },
            { status: "Survived", testsCompleted: 1.5 },
          ],
        },
      },
    })
    expect(mutants.map((m) => m.testsCompleted)).toEqual([0, undefined, undefined])
  })

  it.each([
    [null, 'The mutation report is not an object with a "files" object.'],
    [[], 'The mutation report is not an object with a "files" object.'],
    [{}, 'The mutation report is not an object with a "files" object.'],
    [{ files: [] }, 'The mutation report is not an object with a "files" object.'],
    [
      { files: { "a.ts": null } },
      'The mutation report\'s entry for "a.ts" has no "mutants" array.',
    ],
    [
      { files: { "a.ts": { mutants: {} } } },
      'The mutation report\'s entry for "a.ts" has no "mutants" array.',
    ],
    [
      { files: { "a.ts": { mutants: [null] } } },
      'The mutation report\'s entry for "a.ts" has a mutant with no status.',
    ],
    [
      { files: { "a.ts": { mutants: [{ status: 3 }] } } },
      'The mutation report\'s entry for "a.ts" has a mutant with no status.',
    ],
  ])("fails on a malformed report %j", (report, error) => {
    expect(resolveMutants(report)).toEqual({ ok: false, error })
  })

  it("reads a report with no files as no mutants", () => {
    expect(resolveMutants({ files: {} })).toEqual({ ok: true, mutants: [] })
  })
})

describe("mutationExceptionId", () => {
  it("matches internal-package-contract's ids for the same mutant", () => {
    // A live record from data-cap's .repo-contract/exceptions/mutation.json, made by IPC's check.
    expect(
      mutationExceptionId({
        file: "src/build/flow-scan-class-values.ts",
        mutator: "ArithmeticOperator",
        original: "owners.length - 1",
        replacement: "owners.length + 1",
      }),
    ).toBe("mutation:src/build/flow-scan-class-values.ts:ArithmeticOperator:eed3c89c7a82")
    expect(
      mutationExceptionId({
        file: "src/build/flow-scan-class-values.ts",
        mutator: "ArrayDeclaration",
        original: "[]",
        replacement: '["Stryker was here"]',
      }),
    ).toBe("mutation:src/build/flow-scan-class-values.ts:ArrayDeclaration:a2379e51c088")
  })

  it("ignores the line and every field outside the identity", () => {
    const base: ResolvedMutant = {
      file: "src/a.ts",
      status: "Survived",
      mutator: "M",
      original: "a",
      replacement: "b",
      line: 3,
      column: 1,
      statusReason: undefined,
      testsCompleted: 2,
    }
    const moved: ResolvedMutant = { ...base, line: 90, column: 7, status: "Killed" }
    expect(mutationExceptionId(moved)).toBe(mutationExceptionId(base))
  })

  it("changes with the original or the replacement", () => {
    const base = { file: "f", mutator: "M", original: "a", replacement: "b" }
    const id = mutationExceptionId(base)
    expect(mutationExceptionId({ ...base, original: "b", replacement: "a" })).not.toBe(id)
    expect(mutationExceptionId({ ...base, replacement: "c" })).not.toBe(id)
    expect(id).toMatch(/^mutation:f:M:[0-9a-f]{12}$/)
  })
})

describe("findMutantById", () => {
  const mutants = resolved({
    files: {
      "src/a.ts": {
        source: SOURCE,
        mutants: [
          { mutatorName: "M", replacement: "x", status: "Killed", location: loc(1, 7, 1, 12) },
          { mutatorName: "M", replacement: "x", status: "Survived", location: loc(1, 7, 1, 12) },
          { mutatorName: "N", replacement: "y", status: "Survived", location: loc(1, 1, 1, 6) },
        ],
      },
    },
  })

  it("finds the first mutant an id names", () => {
    const id = mutationExceptionId({
      file: "src/a.ts",
      mutator: "N",
      original: "const",
      replacement: "y",
    })
    expect(findMutantById(mutants, id)).toBe(mutants[2])
    expect(findMutantById(mutants, mutationExceptionId(mutants[1]!))).toBe(mutants[0])
  })

  it("returns undefined for an id that names nothing", () => {
    expect(findMutantById(mutants, "mutation:src/a.ts:M:000000000000")).toBeUndefined()
    expect(findMutantById([], "anything")).toBeUndefined()
  })
})
