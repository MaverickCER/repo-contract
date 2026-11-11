import { describe, expect, it } from "vitest"
import {
  UPSTREAM_CHECKS,
  compareWithOfficial,
  notEvaluatedChecks,
  officialResultUrl,
  parseOfficialResult,
} from "../../../../scripts/openssf-scorecard/official.js"
import type { ScorecardCheckResult } from "../../../../scripts/openssf-scorecard/types.js"

/** The shape api.scorecard.dev actually returns (trimmed from a real response for MaverickCER/repo-contract). */
function apiBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: "2026-11-03T09:59:04Z",
    repo: {
      name: "github.com/MaverickCER/repo-contract",
      commit: "8d5e308aba3a264ff061f2a61062977eb9d71ff9",
    },
    scorecard: { version: "v5.6.0", commit: "eeb4b5d1a2c3" },
    score: 7,
    checks: [
      {
        name: "Code-Review",
        score: 0,
        reason: "Found 0/5 approved changesets -- score normalized to 0",
        details: null,
        documentation: {},
      },
      {
        name: "Packaging",
        score: -1,
        reason: "packaging workflow not detected",
        details: null,
        documentation: {},
      },
      {
        name: "License",
        score: 10,
        reason: "license file detected",
        details: null,
        documentation: {},
      },
    ],
    ...overrides,
  }
}

const local = (
  name: string,
  score: ScorecardCheckResult["score"],
  reason = "local reason",
): ScorecardCheckResult => ({
  name,
  score,
  reason,
  details: [],
})

describe("officialResultUrl", () => {
  it("points at the public Scorecard API for the github.com project", () => {
    expect(officialResultUrl("MaverickCER/repo-contract")).toBe(
      "https://api.scorecard.dev/projects/github.com/MaverickCER/repo-contract",
    )
  })
})

describe("parseOfficialResult", () => {
  it("keeps the score, the scorecard version, the evaluated commit, the date and every check", () => {
    const parsed = parseOfficialResult(apiBody())
    expect(parsed).toEqual({
      date: "2026-11-03T09:59:04Z",
      score: 7,
      scorecardVersion: "v5.6.0",
      commit: "8d5e308aba3a264ff061f2a61062977eb9d71ff9",
      checks: [
        {
          name: "Code-Review",
          score: 0,
          reason: "Found 0/5 approved changesets -- score normalized to 0",
        },
        { name: "Packaging", score: -1, reason: "packaging workflow not detected" },
        { name: "License", score: 10, reason: "license file detected" },
      ],
    })
  })

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["no checks", apiBody({ checks: undefined })],
    ["checks not an array", apiBody({ checks: {} })],
    ["a check without a name", apiBody({ checks: [{ score: 1, reason: "x" }] })],
    [
      "a check with a non-numeric score",
      apiBody({ checks: [{ name: "X", score: "10", reason: "x" }] }),
    ],
    ["a check without a reason", apiBody({ checks: [{ name: "X", score: 1 }] })],
    ["no overall score", apiBody({ score: undefined })],
    ["no date", apiBody({ date: 5 })],
    ["no scorecard version", apiBody({ scorecard: {} })],
    ["no repo commit", apiBody({ repo: { name: "x" } })],
  ])("rejects a body with %s, rather than rendering a half-read result", (_label, body) => {
    expect(parseOfficialResult(body)).toBeUndefined()
  })
})

describe("compareWithOfficial", () => {
  it("pairs each official check with this evaluation's result for it, in the official order", () => {
    const official = parseOfficialResult(apiBody())
    if (official === undefined) throw new Error("fixture did not parse")
    const rows = compareWithOfficial([local("License", 10), local("Code-Review", 0)], official)
    expect(rows.map((row) => row.name)).toEqual(["Code-Review", "Packaging", "License"])
    expect(rows[0]).toMatchObject({ official: { score: 0 }, local: { score: 0 }, differs: false })
    expect(rows[1]).toMatchObject({ official: { score: -1 }, local: undefined, differs: false })
    expect(rows[2]).toMatchObject({ official: { score: 10 }, local: { score: 10 }, differs: false })
  })

  it("marks a check as differing when the two scores are not the same number", () => {
    const official = parseOfficialResult(apiBody())
    if (official === undefined) throw new Error("fixture did not parse")
    const rows = compareWithOfficial([local("Code-Review", 10), local("Packaging", 10)], official)
    expect(rows.find((row) => row.name === "Code-Review")?.differs).toBe(true)
    expect(rows.find((row) => row.name === "Packaging")?.differs).toBe(true)
  })

  it("treats an official -1 and a local not-applicable as agreeing: neither could be scored", () => {
    const official = parseOfficialResult(apiBody())
    if (official === undefined) throw new Error("fixture did not parse")
    const rows = compareWithOfficial([local("Packaging", "not-applicable")], official)
    expect(rows.find((row) => row.name === "Packaging")?.differs).toBe(false)
  })

  it("lists a check only this evaluation scored after the official ones", () => {
    const official = parseOfficialResult(apiBody())
    if (official === undefined) throw new Error("fixture did not parse")
    const rows = compareWithOfficial([local("Vulnerabilities", 10)], official)
    expect(rows.at(-1)).toMatchObject({
      name: "Vulnerabilities",
      official: undefined,
      local: { score: 10 },
      differs: false,
    })
  })
})

describe("notEvaluatedChecks", () => {
  it("is every upstream check this evaluation did not score, in upstream's alphabetical order", () => {
    const evaluated = UPSTREAM_CHECKS.filter((name) => name !== "SBOM" && name !== "Fuzzing").map(
      (name) => local(name, 10),
    )
    expect(notEvaluatedChecks(evaluated)).toEqual(["Fuzzing", "SBOM"])
  })

  it("names Binary-Artifacts and Dependency-Update-Tool when they are not scored, which the old fixed list left out", () => {
    const names = notEvaluatedChecks([local("License", 10)])
    expect(names).toContain("Binary-Artifacts")
    expect(names).toContain("Dependency-Update-Tool")
    expect(names).not.toContain("License")
  })

  it("covers the full upstream check list", () => {
    expect([...UPSTREAM_CHECKS].sort()).toEqual([
      "Binary-Artifacts",
      "Branch-Protection",
      "CI-Tests",
      "CII-Best-Practices",
      "Code-Review",
      "Contributors",
      "Dangerous-Workflow",
      "Dependency-Update-Tool",
      "Fuzzing",
      "License",
      "Maintained",
      "Packaging",
      "Pinned-Dependencies",
      "SAST",
      "SBOM",
      "Security-Policy",
      "Signed-Releases",
      "Token-Permissions",
      "Vulnerabilities",
      "Webhooks",
    ])
  })
})
