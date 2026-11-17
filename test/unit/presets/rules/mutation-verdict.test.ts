import { describe, expect, it } from "vitest"
import { mutationExceptionId } from "../../../../src/affected/mutation-report.js"
import type { ResolvedMutant } from "../../../../src/affected/mutation-report.js"
import { validateExceptionRegistry } from "../../../../src/helpers/exception-record.js"
import {
  applyMutationExceptions,
  COMMENT_IGNORE_REASON,
  judgeMutation,
  MUTATION_EXCEPTION_SCHEMA,
  readMutationRun,
  STATIC_IGNORE_REASON,
} from "../../../../src/presets/rules/mutation-verdict.js"
import type {
  AppliedMutationExceptions,
  MutationExceptionRecord,
  MutationRunReport,
} from "../../../../src/presets/rules/mutation-verdict.js"

let serial = 0
function mutant(status: string, overrides: Partial<ResolvedMutant> = {}): ResolvedMutant {
  serial += 1
  return {
    file: "src/a.ts",
    status,
    mutator: "M",
    original: `a${String(serial)}`,
    replacement: "b",
    line: serial,
    column: 3,
    statusReason: undefined,
    testsCompleted: status === "NoCoverage" ? 0 : 2,
    ...overrides,
  }
}

const times = (count: number, status: string): ResolvedMutant[] =>
  Array.from({ length: count }, () => mutant(status))

const NONE: AppliedMutationExceptions = { suppressed: new Set(), stale: [], insufficient: [] }

const COMPLETE = {
  justification: "Applying it by hand fails the suite.",
  ruleBroken: "Every mutant is detected.",
  attempted: "A second test.",
  constraint: "Per-test coverage misses it.",
  whyPreferable: "The test exists.",
  residualRisk: "None.",
  revisitWhen: "Stryker is upgraded.",
  expires: "",
}

function recordFor(
  target: ResolvedMutant,
  fields: Partial<MutationExceptionRecord> = {},
): MutationExceptionRecord {
  return {
    id: mutationExceptionId(target),
    version: 2,
    file: target.file,
    mutator: target.mutator,
    original: target.original,
    replacement: target.replacement,
    ...COMPLETE,
    ...fields,
  }
}

const NOW = new Date("2026-11-16T12:00:00Z")

describe("readMutationRun", () => {
  const ran: MutationRunReport = {
    schemaVersion: 1,
    state: "ran",
    report: "reports/mutation/mutation.json",
    exitCode: 0,
    shard: null,
    mutate: null,
    timeouts: { rerun: 0, caught: 0 },
    inputs: null,
    message: "Stryker ran.",
  }

  it.each([
    ran,
    { ...ran, state: "reused", inputs: "f".repeat(64) },
    { ...ran, state: "adopted", exitCode: null },
    { ...ran, state: "nothing-to-mutate", exitCode: null, mutate: [] },
    { ...ran, state: "error", exitCode: null, report: "" },
    { ...ran, shard: "2/8", mutate: ["src/a.ts"], timeouts: { rerun: 2, caught: 1 } },
  ])("accepts a well-formed %s report", (report) => {
    expect(readMutationRun(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it.each([
    null,
    "ran",
    { ...ran, schemaVersion: 2 },
    { ...ran, state: "skipped" },
    { ...ran, report: 1 },
    { ...ran, exitCode: "0" },
    { ...ran, shard: 2 },
    { ...ran, mutate: "src/a.ts" },
    { ...ran, mutate: [1] },
    { ...ran, timeouts: null },
    { ...ran, timeouts: { rerun: 1 } },
    { ...ran, timeouts: { rerun: "1", caught: 0 } },
    { ...ran, inputs: 3 },
    { ...ran, message: undefined },
  ])("rejects %j", (value) => {
    expect(readMutationRun(value)).toBeUndefined()
  })
})

describe("MUTATION_EXCEPTION_SCHEMA", () => {
  const target = mutant("Survived")
  const validate = (records: unknown[]) =>
    validateExceptionRegistry(records, MUTATION_EXCEPTION_SCHEMA)

  it("accepts a version 2 record whose id matches its fields", () => {
    const record = recordFor(target)
    expect(validate([record])).toEqual({ ok: true, records: [record] })
  })

  it("accepts a legacy version 1 record", () => {
    const { id, file, mutator, original, replacement } = recordFor(target)
    const legacy = { id, version: 1, justification: "x", file, mutator, original, replacement }
    expect(validate([legacy])).toEqual({ ok: true, records: [legacy] })
  })

  it("accepts an empty replacement, which a removal mutant has", () => {
    const removal = mutant("Survived", { replacement: "" })
    expect(validate([recordFor(removal)]).ok).toBe(true)
  })

  it("rejects a record whose id does not match its fields", () => {
    const result = validate([{ ...recordFor(target), original: "changed" }])
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors).toEqual([
      expect.stringContaining("does not match the id derived from its own file"),
    ])
  })

  it.each([
    ["file", ""],
    ["mutator", 3],
    ["original", ""],
    ["replacement", null],
  ])("rejects a record whose %s is %j", (field, value) => {
    const result = validate([{ ...recordFor(target), [field]: value }])
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors).toEqual([
      expect.stringContaining(`exceptions[0].${field}`),
    ])
  })
})

describe("applyMutationExceptions", () => {
  it("suppresses a Survived or NoCoverage mutant a complete record covers", () => {
    const survived = mutant("Survived")
    const uncovered = mutant("NoCoverage")
    const killed = mutant("Killed", { original: survived.original })
    const applied = applyMutationExceptions(
      [survived, uncovered, killed],
      [recordFor(survived), recordFor(uncovered)],
      { full: true, now: NOW },
    )
    expect([...applied.suppressed]).toEqual([survived, uncovered])
    expect(applied.stale).toEqual([])
    expect(applied.insufficient).toEqual([])
  })

  it("matches by file, mutator, original and replacement, never by line", () => {
    const survived = mutant("Survived")
    const moved = { ...survived, line: 400, column: 9 }
    const applied = applyMutationExceptions([moved], [recordFor(survived)], {
      full: true,
      now: NOW,
    })
    expect([...applied.suppressed]).toEqual([moved])
  })

  it.each([
    ["file", { file: "src/b.ts" }],
    ["mutator", { mutator: "N" }],
    ["replacement", { replacement: "c" }],
  ])("does not match a record whose %s differs", (_field, change) => {
    const survived = mutant("Survived")
    const other = { ...survived, ...change }
    const record = { ...recordFor(other), id: mutationExceptionId(other) }
    const applied = applyMutationExceptions([survived], [record], { full: true, now: NOW })
    expect(applied.suppressed.size).toBe(0)
    expect(applied.stale).toHaveLength(1)
  })

  it("never suppresses a Timeout", () => {
    const timeout = mutant("Timeout")
    const applied = applyMutationExceptions([timeout], [recordFor(timeout)], {
      full: true,
      now: NOW,
    })
    expect(applied).toEqual({ suppressed: new Set(), stale: [], insufficient: [] })
  })

  it("reports an incomplete record and suppresses nothing with it", () => {
    const survived = mutant("Survived")
    const record = recordFor(survived, { attempted: " ", residualRisk: "" })
    const applied = applyMutationExceptions([survived], [record], { full: true, now: NOW })
    expect(applied.suppressed.size).toBe(0)
    expect(applied.insufficient).toEqual([
      `${record.id} is missing attempted, residualRisk. Run \`repo-contract except ${record.id}\` to fill them in.`,
    ])
  })

  it("reports an expired record and suppresses nothing with it", () => {
    const survived = mutant("Survived")
    const record = recordFor(survived, { expires: "2026-11-15" })
    const applied = applyMutationExceptions([survived], [record], { full: true, now: NOW })
    expect(applied.suppressed.size).toBe(0)
    expect(applied.insufficient).toEqual([
      `${record.id} expired on 2026-11-15. Re-verify the mutant by hand and move the date, or delete the record.`,
    ])
  })

  it("keeps a record that expires today or later", () => {
    const survived = mutant("Survived")
    const applied = applyMutationExceptions(
      [survived],
      [recordFor(survived, { expires: "2026-11-16" })],
      { full: true, now: NOW },
    )
    expect(applied.suppressed.size).toBe(1)
  })

  it("lets a legacy version 1 record with a justification suppress", () => {
    const survived = mutant("Survived")
    const { id, file, mutator, original, replacement } = recordFor(survived)
    const legacy = {
      id,
      version: 1 as const,
      justification: "Hand-verified.",
      file,
      mutator,
      original,
      replacement,
    }
    const applied = applyMutationExceptions([survived], [legacy], { full: true, now: NOW })
    expect(applied.suppressed.size).toBe(1)
    expect(applied.insufficient).toEqual([])
  })

  it("reports an unmatched record as stale only on a full run", () => {
    const gone = mutant("Survived")
    const record = recordFor(gone)
    const others = [mutant("Killed")]
    expect(applyMutationExceptions(others, [record], { full: false, now: NOW }).stale).toEqual([])
    expect(applyMutationExceptions(others, [record], { full: true, now: NOW }).stale).toEqual([
      `${record.id}: ${gone.file} [M] "${gone.original}" -> "b" matches no mutant in the report; the code changed, so delete the record.`,
    ])
  })

  it("does not call a record stale while it matches a Killed mutant", () => {
    const killed = mutant("Killed")
    const applied = applyMutationExceptions([killed], [recordFor(killed)], { full: true, now: NOW })
    expect(applied).toEqual({ suppressed: new Set(), stale: [], insufficient: [] })
  })
})

describe("judgeMutation", () => {
  const judge = (
    mutants: readonly ResolvedMutant[],
    options: { applied?: AppliedMutationExceptions; minScore?: number; shard?: string | null } = {},
  ) =>
    judgeMutation({
      mutants,
      applied: options.applied ?? NONE,
      minScore: options.minScore ?? 80,
      shard: options.shard ?? null,
    })

  it("passes at minScore 80 with 80% detected, and lists the survivors it tolerates", () => {
    const survived = mutant("Survived", {
      file: "src/s.ts",
      line: 7,
      column: 2,
      original: "x - 1",
      replacement: "x + 1",
    })
    const result = judge([...times(4, "Killed"), survived])
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toBe(
      [
        "Mutation: score 80.00% of 5 scored mutants (minimum 80%): 4 detected (4 killed), 1 survived, 0 no coverage, 0 timed out.",
        "Survived within the floor (1):",
        `- src/s.ts:7:2 [Survived M] "x - 1" -> "x + 1" (${mutationExceptionId(survived)})`,
      ].join("\n"),
    )
  })

  it("passes at 100% without listing anything", () => {
    expect(judge(times(3, "Killed"), { minScore: 100 })).toEqual({
      outcome: "pass",
      rationale:
        "Mutation: score 100.00% of 3 scored mutants (minimum 100%): 3 detected (3 killed), 0 survived, 0 no coverage, 0 timed out.",
    })
  })

  it("fails below minScore and lists the offenders", () => {
    const survived = mutant("Survived", {
      file: "src/s.ts",
      line: 3,
      column: 1,
      original: "a\n  &&   b",
      replacement: "true",
    })
    const uncovered = mutant("NoCoverage", {
      file: "src/u.ts",
      line: 9,
      column: 4,
      original: "f()",
      replacement: "",
    })
    const result = judge([...times(2, "Killed"), survived, uncovered])
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "Mutation: score 50.00% of 4 scored mutants (minimum 80%): 2 detected (2 killed), 1 survived, 1 no coverage, 0 timed out.",
        "Below the minimum score of 80%. Add or strengthen a test that fails against each change below, or record a mutant you killed by hand with `repo-contract except <id>`:",
        `- src/s.ts:3:1 [Survived M] "a && b" -> "true" (${mutationExceptionId(survived)})`,
        `- src/u.ts:9:4 [NoCoverage M] "f()" -> "" (${mutationExceptionId(uncovered)})`,
      ].join("\n"),
    )
  })

  it("caps the listing and truncates long snippets", () => {
    const long = "x".repeat(100)
    const result = judge(times(30, "Survived").map((m) => ({ ...m, original: long })))
    const lines = result.rationale.split("\n")
    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(25)
    expect(lines.at(-1)).toBe("... and 5 more.")
    expect(lines[2]).toContain(`"${"x".repeat(80)}…"`)
  })

  it("lists a snippet on one line with the whitespace around it trimmed", () => {
    const result = judge([mutant("Survived", { original: "\n  if (a) {\n    b()\n  }\n" })])
    expect(result.rationale).toContain(`[Survived M] "if (a) { b() }" -> "b"`)
  })

  it("lists exactly 25 offenders in full, and keeps an 80-character snippet whole", () => {
    const exact = "y".repeat(80)
    const result = judge(times(25, "Survived").map((m) => ({ ...m, original: exact })))
    const lines = result.rationale.split("\n")
    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(25)
    expect(lines.at(-1)?.startsWith("- ")).toBe(true)
    expect(lines[2]).toContain(`"${exact}" ->`)
  })

  it("fails on any Timeout whatever the score", () => {
    const timeout = mutant("Timeout", {
      file: "src/t.ts",
      line: 5,
      column: 1,
      original: "i < n",
      replacement: "true",
    })
    const result = judge([...times(99, "Killed"), timeout], { minScore: 80 })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "Mutation: score 99.00% of 100 scored mutants (minimum 80%): 99 detected (99 killed), 0 survived, 0 no coverage, 1 timed out.",
        "Timed out even when re-run alone (1). A record never covers a Timeout. A mutant that removes a loop bound can only hang: add a fail-fast guard in the source, or a Stryker disable comment that gives the reason:",
        '- src/t.ts:5:1 [Timeout M] "i < n" -> "true"',
      ].join("\n"),
    )
  })

  it("leaves Ignored and suppressed mutants out of the score, and says why each was left out", () => {
    const survived = mutant("Survived")
    const ignored = [
      mutant("Ignored", { statusReason: COMMENT_IGNORE_REASON }),
      mutant("Ignored", { statusReason: STATIC_IGNORE_REASON }),
      mutant("Ignored", { statusReason: STATIC_IGNORE_REASON }),
      mutant("Ignored", { statusReason: "Ignored by excludedMutations" }),
    ]
    const result = judge([...times(2, "Killed"), survived, ...ignored], {
      minScore: 100,
      applied: { suppressed: new Set([survived]), stale: [], insufficient: [] },
    })
    expect(result).toEqual({
      outcome: "pass",
      rationale: [
        "Mutation: score 100.00% of 2 scored mutants (minimum 100%): 2 detected (2 killed), 0 survived, 0 no coverage, 0 timed out.",
        "Left out of the score: 1 covered by a registry record; 1 ignored by a Stryker disable comment; 2 static, skipped by ignoreStatic; 1 ignored for another reason (such as excludedMutations).",
      ].join("\n"),
    })
  })

  it("counts RuntimeError and CompileError as detected", () => {
    const result = judge([mutant("Killed"), mutant("RuntimeError"), mutant("CompileError")], {
      minScore: 100,
    })
    expect(result).toEqual({
      outcome: "pass",
      rationale:
        "Mutation: score 100.00% of 3 scored mutants (minimum 100%): 3 detected (1 killed, 1 runtime error, 1 compile error), 0 survived, 0 no coverage, 0 timed out.",
    })
  })

  it("passes with no score when every mutant is left out, and says no mutant was tested", () => {
    const result = judge([mutant("Ignored", { statusReason: STATIC_IGNORE_REASON })], {
      minScore: 100,
    })
    expect(result).toEqual({
      outcome: "pass",
      rationale: [
        "Mutation: no mutant was tested, so there is no score to judge: every one of the 1 in the report was left out.",
        "Left out of the score: 1 static, skipped by ignoreStatic.",
      ].join("\n"),
    })
    // The verdict carries no score field, so the evidence can hold no NaN or null in its place.
    const serialised = JSON.stringify(result)
    expect(Object.keys(result).sort()).toEqual(["outcome", "rationale"])
    expect(serialised).not.toMatch(/NaN|null/)
  })

  it("still fails a run with nothing to score when the registry has a problem", () => {
    const left = mutant("Ignored", { statusReason: STATIC_IGNORE_REASON })
    const result = judgeMutation({
      mutants: [left],
      applied: { suppressed: new Set(), insufficient: ["record x is incomplete"], stale: [] },
      minScore: 100,
      shard: null,
    })
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        "Mutation: no mutant was tested, so there is no score to judge: every one of the 1 in the report was left out.",
        "Left out of the score: 1 static, skipped by ignoreStatic.",
        "The registry has 1 problem(s):",
        "- record x is incomplete",
      ].join("\n"),
    })
  })

  it("fails on a report with no mutants", () => {
    expect(judge([])).toEqual({
      outcome: "fail",
      rationale:
        "Mutation: the report has no mutants, so it cannot show what the tests detect. Check the Stryker config's mutate patterns.",
    })
  })

  it("refuses a run whose Survived mutants ran 0 tests", () => {
    const result = judge([
      mutant("Killed"),
      mutant("Survived", { testsCompleted: 0 }),
      mutant("Survived", { testsCompleted: 0 }),
      mutant("Survived", { testsCompleted: undefined }),
    ])
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "Mutation: 2 Survived mutant(s) ran 0 tests, so the run cannot be trusted: a survivor that no test ran against proves nothing. The usual causes are a stale incremental file or a test runner that matches no test name (stryker-js#6210). Run `repo-contract mutation run` again; it always runs cold.",
    })
  })

  it("fails on a status Stryker does not report", () => {
    const pending = mutant("Pending", {
      file: "src/p.ts",
      line: 1,
      column: 1,
      original: "a",
      replacement: "b",
    })
    const result = judge([...times(9, "Killed"), pending], { minScore: 0 })
    expect(result.outcome).toBe("fail")
    expect(result.rationale.split("\n").slice(1)).toEqual([
      "Unknown status (1). The report may be from a newer Stryker, or cut short:",
      '- src/p.ts:1:1 [Pending M] "a" -> "b"',
    ])
  })

  it("fails on registry problems even when the score passes", () => {
    const result = judge(times(2, "Killed"), {
      minScore: 100,
      applied: { suppressed: new Set(), stale: ["stale one"], insufficient: ["incomplete one"] },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale.split("\n").slice(1)).toEqual([
      "The registry has 2 problem(s):",
      "- incomplete one",
      "- stale one",
    ])
  })

  it("names the shard in its rationale", () => {
    const result = judge(times(1, "Killed"), { shard: "3/8" })
    expect(result.rationale.startsWith("Mutation, shard 3/8: score 100.00%")).toBe(true)
    expect(
      judge([], { shard: "3/8" }).rationale.startsWith("Mutation, shard 3/8: the report"),
    ).toBe(true)
  })

  it("scores 2 of 3 as 66.67%", () => {
    const result = judge([mutant("Killed"), mutant("Killed"), mutant("Survived")], { minScore: 66 })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("score 66.67% of 3")
  })
})
