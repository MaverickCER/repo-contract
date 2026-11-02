import { describe, expect, it } from "vitest"
import { createRunRecord, parseRunLog, serializeRunRecord } from "../../../src/metrics/record.js"

const input = {
  startedAt: "2026-11-02T10:00:00.000Z",
  durationMs: 1200,
  scope: "affected" as const,
  checks: [
    { id: "lint", durationMs: 200, verdict: "pass" as const, pillar: "maintainability" as const },
    { id: "tests", durationMs: 900, verdict: "fail" as const, cache: "miss" as const },
  ],
}

describe("createRunRecord", () => {
  it("stamps the schema version and keeps what it was given", () => {
    const record = createRunRecord({
      ...input,
      actor: "agent",
      change: "pr-7",
      mutationScore: 99.5,
    })
    expect(record).toMatchObject({
      schemaVersion: 1,
      scope: "affected",
      actor: "agent",
      change: "pr-7",
      mutationScore: 99.5,
      durationMs: 1200,
    })
    expect(record.checks).toHaveLength(2)
  })

  it("omits optional fields that were not given, rather than writing undefined", () => {
    const record = createRunRecord(input)
    expect(Object.keys(record).sort()).toEqual([
      "checks",
      "durationMs",
      "schemaVersion",
      "scope",
      "startedAt",
    ])
  })

  it.each([
    [{ startedAt: "yesterday" }, "startedAt must be an ISO 8601 timestamp"],
    [{ durationMs: -1 }, "durationMs must be a non-negative number"],
    [{ durationMs: Number.NaN }, "durationMs must be a non-negative number"],
    [{ scope: "partial" }, "scope must be affected or full"],
    [{ actor: "robot" }, "actor must be human or agent"],
    [{ mutationScore: 101 }, "mutationScore must be between 0 and 100"],
    [{ coverage: -1 }, "coverage must be between 0 and 100"],
    [
      { checks: [{ id: "", durationMs: 1, verdict: "pass" }] },
      "checks[0].id must be a non-empty string",
    ],
    [
      { checks: [{ id: "a", durationMs: 1, verdict: "ok" }] },
      "checks[0].verdict must be pass, warn or fail",
    ],
    [
      { checks: [{ id: "a", durationMs: -5, verdict: "pass" }] },
      "checks[0].durationMs must be a non-negative number",
    ],
    [
      { checks: [{ id: "a", durationMs: 1, verdict: "pass", cache: "maybe" }] },
      "checks[0].cache must be hit, miss or off",
    ],
    [
      { checks: [{ id: "a", durationMs: 1, verdict: "pass", pillar: "vibes" }] },
      "checks[0].pillar must be one of",
    ],
    [{ changedFiles: 1.5 }, "changedFiles must be a non-negative whole number"],
    [{ affectedTests: -1 }, "affectedTests must be a non-negative whole number"],
    [{ totalTests: -1 }, "totalTests must be a non-negative whole number"],
    [{ exceptions: -1 }, "exceptions must be a non-negative whole number"],
    [{ suppressions: 0.5 }, "suppressions must be a non-negative whole number"],
  ])("rejects %j", (patch, message) => {
    expect(() => createRunRecord({ ...input, ...patch } as never)).toThrow(message)
  })
})

describe("serializeRunRecord / parseRunLog", () => {
  it("writes one line per record and reads the same records back", () => {
    const a = createRunRecord(input)
    const b = createRunRecord({ ...input, scope: "full" })
    const line = serializeRunRecord(a)
    expect(line.endsWith("\n")).toBe(true)
    expect(line.slice(0, -1)).not.toContain("\n")
    const parsed = parseRunLog(serializeRunRecord(a) + serializeRunRecord(b))
    expect(parsed.errors).toEqual([])
    expect(parsed.records).toEqual([a, b])
  })

  it("skips blank lines and reports unreadable ones by line number without losing the rest", () => {
    const good = serializeRunRecord(createRunRecord(input))
    const parsed = parseRunLog(
      `${good}\n{not json\n${good}[]\n${JSON.stringify({ schemaVersion: 2 })}\n`,
    )
    expect(parsed.records).toHaveLength(2)
    expect(parsed.errors.map((e) => e.line)).toEqual([3, 5, 6])
    expect(parsed.errors[0]?.message).toContain("not valid JSON")
    expect(parsed.errors[2]?.message).toContain("schemaVersion")
  })

  it("reads an empty log as no records", () => {
    expect(parseRunLog("")).toEqual({ records: [], errors: [] })
  })
})

describe("createRunRecord details", () => {
  const base = {
    startedAt: "2026-11-02T10:00:00.000Z",
    durationMs: 0,
    scope: "full" as const,
    checks: [] as never[],
  }

  it("accepts the boundaries: a zero duration, 0 and 100 percent, zero counts", () => {
    expect(() =>
      createRunRecord({ ...base, mutationScore: 0, coverage: 100, changedFiles: 0 }),
    ).not.toThrow()
    expect(() => createRunRecord({ ...base, mutationScore: 100, coverage: 0 })).not.toThrow()
  })

  it("refuses numbers that only look like numbers", () => {
    for (const patch of [
      { durationMs: "5" },
      { durationMs: Number.POSITIVE_INFINITY },
      { durationMs: null },
      { mutationScore: "50" },
      { coverage: "50" },
      { changedFiles: "1" },
      { suppressions: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => createRunRecord({ ...base, ...patch } as never)).toThrow()
    }
    expect(() => createRunRecord({ ...base, mutationScore: 100.5 })).toThrow(
      "mutationScore must be between 0 and 100.",
    )
    expect(() => createRunRecord({ ...base, coverage: Number.NaN })).toThrow(
      "coverage must be between 0 and 100.",
    )
  })

  it("refuses a start time that is not an ISO timestamp, however parseable", () => {
    for (const startedAt of [
      " 2026-11-02T10:00:00.000Z",
      "Sat, 02 Nov 2026 10:00:00 GMT",
      "2026-11-02",
      20261102,
      null,
    ]) {
      expect(() => createRunRecord({ ...base, startedAt } as never)).toThrow(
        "startedAt must be an ISO 8601 timestamp.",
      )
    }
    expect(() => createRunRecord({ ...base, startedAt: "2026-13-45T99:00:00Z" })).toThrow(
      "startedAt",
    )
  })

  it("refuses a check id that is not text", () => {
    expect(() =>
      createRunRecord({ ...base, checks: [{ id: 5, durationMs: 1, verdict: "pass" }] } as never),
    ).toThrow("checks[0].id must be a non-empty string.")
  })

  it("names the pillars it knows in the error", () => {
    expect(() =>
      createRunRecord({
        ...base,
        checks: [{ id: "a", durationMs: 1, verdict: "pass", pillar: "vibes" }],
      } as never),
    ).toThrow(
      "checks[0].pillar must be one of correctness, security, performance, accessibility, compliance, maintainability.",
    )
  })

  it("keeps exactly the fields a check was given, and none it was not", () => {
    const record = createRunRecord({
      ...base,
      checks: [
        { id: "a", durationMs: 1, verdict: "pass" },
        { id: "b", durationMs: 2, verdict: "warn", cache: "hit", pillar: "security", shard: 2 },
      ],
    })
    expect(record.checks[0]).toStrictEqual({ id: "a", durationMs: 1, verdict: "pass" })
    expect(record.checks[1]).toStrictEqual({
      id: "b",
      durationMs: 2,
      verdict: "warn",
      cache: "hit",
      pillar: "security",
      shard: 2,
    })
  })

  it("keeps the optional fields it is given and drops unknown ones", () => {
    const record = createRunRecord({
      ...base,
      base: "origin/main",
      actor: "human",
      change: "pr-1",
      widenings: ["global-trigger"],
      extra: "dropped",
    } as never)
    expect(record).toMatchObject({
      base: "origin/main",
      actor: "human",
      change: "pr-1",
      widenings: ["global-trigger"],
    })
    expect(record).not.toHaveProperty("extra")
  })
})

describe("parseRunLog details", () => {
  it("skips a line of only whitespace without calling it an error", () => {
    expect(parseRunLog("   \n\t\n")).toEqual({ records: [], errors: [] })
  })

  it("reports a line that is JSON but not an object with schemaVersion 1", () => {
    for (const line of ["5", "null", '"text"', "true", "[]", "{}"]) {
      expect(parseRunLog(line)).toEqual({
        records: [],
        errors: [{ line: 1, message: "Line 1: schemaVersion must be 1." }],
      })
    }
  })

  it("reports why a record with schemaVersion 1 is invalid, with its line", () => {
    const good = serializeRunRecord(
      createRunRecord({
        startedAt: "2026-11-02T10:00:00.000Z",
        durationMs: 1,
        scope: "full",
        checks: [],
      }),
    )
    const result = parseRunLog(`${good}{"schemaVersion":1}\n`)
    expect(result.records).toHaveLength(1)
    expect(result.errors).toEqual([
      { line: 2, message: "Line 2: startedAt must be an ISO 8601 timestamp." },
    ])
  })
})
