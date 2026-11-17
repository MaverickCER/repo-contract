import { beforeEach, describe, expect, it, vi } from "vitest"
import { coverage } from "../../../src/presets/coverage.js"
import { crap } from "../../../src/presets/crap.js"
import { duplication } from "../../../src/presets/duplication.js"
import { mutation } from "../../../src/presets/mutation.js"
import { PRESET_SETTINGS } from "../../../src/tiers/catalog.js"
import type { CheckDefinitionConfig, CheckEvidence } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "../presets/fixtures.js"

// PRESET_SETTINGS claims to equal what each preset judges with no options. These tests run the
// real presets on fixtures either side of each claimed value, so a changed default goes red here.

// The registry loader probes for a symbolic link first; here no path exists to be one.
const { readFile, lstat } = vi.hoisted(() => ({
  readFile: vi.fn(),
  lstat: () => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
}))
vi.mock("node:fs/promises", () => ({ readFile, lstat }))

beforeEach(() => {
  readFile.mockReset()
})

/**
 * @param check - a real preset's check.
 * @param evidence - the evidence its policy reads.
 * @returns the policy's outcome.
 */
async function outcomeOf(
  check: CheckDefinitionConfig,
  evidence: CheckEvidence = fakeCheckEvidence(),
): Promise<string> {
  return (await check.policy(fakeContext(evidence))).outcome
}

describe("PRESET_SETTINGS matches the presets' own defaults", () => {
  it("coverage() judges lines and statements at 80 and nothing else", async () => {
    expect(PRESET_SETTINGS.Coverage).toEqual({ lines: 80, statements: 80 })
    const metric = (pct: number) => ({ total: 10, covered: 8, skipped: 0, pct })
    const summary = (lines: number, statements: number) =>
      fakeCheckEvidence({
        command: "node",
        output: {
          format: "json",
          success: true,
          value: {
            total: {
              lines: metric(lines),
              statements: metric(statements),
              functions: metric(0),
              branches: metric(0),
            },
          },
        },
      })
    expect(await outcomeOf(coverage(), summary(80, 80))).toBe("pass")
    expect(await outcomeOf(coverage(), summary(79.9, 80))).toBe("fail")
    expect(await outcomeOf(coverage(), summary(80, 79.9))).toBe("fail")
  })

  it("crap() fails above CRAP 30 or complexity 20 and passes at both", async () => {
    expect(PRESET_SETTINGS.Crap).toEqual({ threshold: 30, maxComplexity: 20 })
    const scored = (complexity: number, score: number) => {
      readFile.mockResolvedValue(
        JSON.stringify({
          functions: [{ file: "src/a.ts", name: "f", startLine: 1, complexity, crap: score }],
        }),
      )
      return outcomeOf(crap(), fakeCheckEvidence({ command: "crap4ts" }))
    }
    expect(await scored(20, 30)).toBe("pass")
    expect(await scored(21, 21)).toBe("fail")
    expect(await scored(5, 30.5)).toBe("fail")
  })

  it("duplication() fails on any duplicated block, a budget of 0", async () => {
    expect(PRESET_SETTINGS.Duplication).toEqual({ maxPercentage: 0 })
    const span = (name: string) => ({ name, start: 1, end: 6 })
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: [
          {
            format: "typescript",
            lines: 5,
            tokens: 50,
            firstFile: span("a.ts"),
            secondFile: span("b.ts"),
          },
        ],
        statistics: {
          total: { clones: 1, duplicatedLines: 5, lines: 50_000, percentage: 0.01, sources: 2 },
        },
      }),
    )
    const evidence = fakeCheckEvidence({ command: "jscpd" })
    expect(await outcomeOf(duplication(), evidence)).toBe("fail")
    // The same report passes a 0.01% budget, so the failure above is the budget's.
    expect(await outcomeOf(duplication({ maxPercentage: 0.01 }), evidence)).toBe("pass")
  })

  it("mutation() passes a score of 80 and fails one of 79.9", async () => {
    expect(PRESET_SETTINGS.Mutation).toEqual({ minScore: 80 })
    const report = "reports/mutation/mutation.json"
    const run = fakeCheckEvidence({
      command: "repo-contract",
      output: {
        format: "json",
        success: true,
        value: {
          schemaVersion: 1,
          state: "ran",
          report,
          exitCode: 0,
          shard: null,
          mutate: null,
          timeouts: { rerun: 0, caught: 0 },
          inputs: null,
          message: "Stryker ran every mutant cold.",
        },
      },
    })
    const mutant = (status: string, index: number) => ({
      id: String(index),
      mutatorName: "BooleanLiteral",
      replacement: "false",
      status,
      testsCompleted: 1,
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
    })
    // Scores of 800/1000 and 799/1000: either side of the 80 the catalog claims.
    const serve = (killed: number, survived: number) => {
      const mutants = [
        ...Array.from({ length: killed }, (_, index) => mutant("Killed", index)),
        ...Array.from({ length: survived }, (_, index) => mutant("Survived", killed + index)),
      ]
      const json = JSON.stringify({
        schemaVersion: "1",
        files: { "src/a.ts": { language: "typescript", source: "true\n", mutants } },
      })
      readFile.mockImplementation((file: string) =>
        file === report
          ? Promise.resolve(json)
          : Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      )
    }
    serve(800, 200)
    expect(await outcomeOf(mutation(), run)).toBe("pass")
    serve(799, 201)
    expect(await outcomeOf(mutation(), run)).toBe("fail")
  })
})
