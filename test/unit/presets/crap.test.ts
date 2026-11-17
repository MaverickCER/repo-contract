import { beforeEach, describe, expect, it, vi } from "vitest"
import { crap } from "../../../src/presets/crap.js"
import type { CrapOptions } from "../../../src/presets/crap.js"
import type { CheckEvidence, PolicyContext } from "../../../src/types.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "./fixtures.js"

// Mocked, as in duplication.test.ts: process.chdir() throws in Stryker's worker threads, and
// this repository's own contract writes reports/ while this suite runs.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
  readFile.mockRejectedValue(new Error("ENOENT"))
})

function writeReport(value: unknown, file = "reports/crap.json"): void {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  readFile.mockImplementation((requested: string) =>
    requested === file ? Promise.resolve(text) : Promise.reject(new Error("ENOENT")),
  )
}

const fn = (name: string, crapScore: number, complexity: number) => ({
  file: "src/a.ts",
  name,
  startLine: 3,
  complexity,
  crap: crapScore,
})

const withDependencies = (
  result: CheckEvidence,
  dependencies: Record<string, CheckEvidence>,
): PolicyContext => ({ ...fakeContext(result), dependencies })

describe("R7b crap preset", () => {
  it.each([
    ["threshold", "-1", { threshold: -1 }],
    ["threshold", "0", { threshold: 0 }],
    ["threshold", "NaN", { threshold: Number.NaN }],
    ["threshold", "Infinity", { threshold: Number.POSITIVE_INFINITY }],
    ["threshold", '"30"', { threshold: "30" }],
    ["maxComplexity", "-1", { maxComplexity: -1 }],
    ["maxComplexity", "0", { maxComplexity: 0 }],
  ])("throws RangeError when the config loads, on a %s of %s", (name, shown, options) => {
    expect(() => crap(options as CrapOptions)).toThrow(
      new RangeError(`crap: ${name} must be a number above 0, got ${shown}.`),
    )
  })

  it.each([
    ["null", null, "null"],
    ["a string", "src", '"src"'],
  ])("throws TypeError when the config loads, on options that are %s", (_label, options, shown) => {
    expect(() => crap(options as unknown as CrapOptions)).toThrow(
      new TypeError(`crap: options must be an object, got ${shown}.`),
    )
  })

  it("accepts any finite limit above 0", () => {
    expect(() => crap({ threshold: 0.5, maxComplexity: 1 })).not.toThrow()
  })

  it("runs crap4ts over src with the coverage, threshold, ignore and --output report", () => {
    expect(crap().run).toEqual([
      "crap4ts",
      "src",
      "--coverage",
      "coverage/coverage-final.json",
      "--threshold",
      "30",
      "--reporter",
      "json",
      "--output",
      "reports/crap.json",
    ])
    expect(
      crap({
        coverage: "coverage/aggregate/final.json",
        threshold: 25,
        ignore: ["**/_ipc/**", "**/*.generated.ts"],
        report: "coverage/aggregate/crap.json",
      }).run,
    ).toEqual([
      "crap4ts",
      "src",
      "--coverage",
      "coverage/aggregate/final.json",
      "--threshold",
      "25",
      "--reporter",
      "json",
      "--output",
      "coverage/aggregate/crap.json",
      "--ignore",
      "**/_ipc/**",
      "--ignore",
      "**/*.generated.ts",
    ])
  })

  it("honours src as a list", () => {
    expect((crap({ src: ["src", "bin"] }).run as readonly string[]).slice(0, 4)).toEqual([
      "crap4ts",
      "src",
      "bin",
      "--coverage",
    ])
    expect((crap({ src: "lib" }).run as readonly string[]).slice(0, 3)).toEqual([
      "crap4ts",
      "lib",
      "--coverage",
    ])
  })

  it("passes a report within both ceilings", async () => {
    writeReport({ functions: [fn("a", 30, 20)] })
    expect(await crap().policy(fakeContext(fakeCheckEvidence()))).toEqual({
      outcome: "pass",
      rationale: "crap4ts scored 1 function(s); none is above CRAP 30 or cyclomatic complexity 20.",
    })
  })

  it("judges the configured limits and reads the configured report path", async () => {
    writeReport({ functions: [fn("a", 26, 12)] }, "reports/other/crap.json")
    const check = crap({ threshold: 25, maxComplexity: 10, report: "reports/other/crap.json" })
    const result = await check.policy(fakeContext(fakeCheckEvidence()))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("1 function(s) are above CRAP 25:")
    expect(result.rationale).toContain("1 function(s) are above cyclomatic complexity 10:")
  })

  it("fails when the report file is missing, with what crap4ts printed", async () => {
    const result = await crap().policy(
      fakeContext(fakeCheckEvidence({ stderr: "no coverage found" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "crap4ts wrote no readable reports/crap.json. Is coverage/coverage-final.json there? The tests must run with coverage first.\nno coverage found",
    })
  })

  it("fails without a trailing line when the report is missing and crap4ts printed nothing", async () => {
    expect(await crap().policy(fakeContext(fakeCheckEvidence()))).toEqual({
      outcome: "fail",
      rationale:
        "crap4ts wrote no readable reports/crap.json. Is coverage/coverage-final.json there? The tests must run with coverage first.",
    })
  })

  it("reads the report as UTF-8 text", async () => {
    writeReport({ functions: [] })
    await crap().policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledWith("reports/crap.json", "utf8")
  })

  it("names crap4ts when it timed out", async () => {
    expect(
      await crap().policy(fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null }))),
    ).toEqual({
      outcome: "fail",
      rationale:
        "crap4ts did not finish: its process exceeded the configured timeout and was terminated.",
    })
  })

  it("names every failed dependency, comma-separated", async () => {
    const result = await crap().policy(
      withDependencies(fakeCheckEvidence(), {
        Tests: fakeCheckEvidence({ exitCode: 1 }),
        Coverage: fakeCheckEvidence({ exitCode: 1 }),
      }),
    )
    expect(result.rationale).toBe(
      "Crap: not evaluated, because Coverage, Tests did not pass, and that already fails the run.",
    )
  })

  it("fails when the report is not JSON", async () => {
    writeReport("{")
    expect(await crap().policy(fakeContext(fakeCheckEvidence()))).toEqual({
      outcome: "fail",
      rationale: "crap4ts wrote reports/crap.json, but it is not valid JSON.",
    })
  })

  it("fails on a non-zero exit without reading a report a previous run left", async () => {
    writeReport({ functions: [] })
    const result = await crap().policy(
      fakeContext(fakeCheckEvidence({ exitCode: 2, stderr: "crap4ts: bad glob" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "crap4ts exited 2 before it scored anything:\ncrap4ts: bad glob",
    })
  })

  it("fails with an actionable message when @danibram/crap4ts is not installed", async () => {
    const result = await crap().policy(fakeContext(enoentEvidence("crap4ts")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`@danibram/crap4ts`")
  })

  it("warns, not evaluated, when a dependency it waits on failed", async () => {
    writeReport({ functions: [fn("a", 300, 25)] })
    const result = await crap().policy(
      withDependencies(fakeCheckEvidence(), { Coverage: fakeCheckEvidence({ exitCode: 1 }) }),
    )
    expect(result).toEqual({
      outcome: "warn",
      rationale:
        "Crap: not evaluated, because Coverage did not pass, and that already fails the run.",
    })
  })
})
