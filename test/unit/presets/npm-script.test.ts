import { describe, expect, it } from "vitest"
import { npmScript } from "../../../src/presets/npm-script.js"
import type { NpmScriptOptions } from "../../../src/presets/npm-script.js"
import type { CheckEvidence } from "../../../src/types.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "./fixtures.js"

const report = (fields: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  script: "build",
  state: "ran",
  exitCode: 0,
  timedOut: false,
  changed: [],
  output: "",
  ...fields,
})

const reportEvidence = (value: unknown): CheckEvidence =>
  fakeCheckEvidence({ output: { format: "json", success: true, value } })

describe("R7b npmScript preset", () => {
  it("runs repo-contract npm-script <script> --json with --must-not-change per path", () => {
    expect(npmScript({ script: "build" }).run).toEqual([
      "repo-contract",
      "npm-script",
      "build",
      "--json",
    ])
    const check = npmScript({
      script: "docs:api:report",
      mustNotChange: ["docs/api-report", "README.md"],
    })
    expect(check.run).toEqual([
      "repo-contract",
      "npm-script",
      "docs:api:report",
      "--json",
      "--must-not-change",
      "docs/api-report",
      "--must-not-change",
      "README.md",
    ])
    expect(check.output).toEqual({ format: "json" })
    expect(check.timeoutMs).toBeUndefined()
  })

  it("passes --timeout to the command and gives the check a minute more", () => {
    const check = npmScript({ script: "size", timeoutMs: 90_000 })
    expect(check.run).toEqual([
      "repo-contract",
      "npm-script",
      "size",
      "--json",
      "--timeout",
      "90000",
    ])
    expect(check.timeoutMs).toBe(150_000)
  })

  it("uses the script name as the label by default", async () => {
    expect(
      await npmScript({ script: "build" }).policy(fakeContext(reportEvidence(report()))),
    ).toEqual({
      outcome: "pass",
      rationale: "build: `npm run build` exited 0 and changed no watched path.",
    })
    expect(
      (
        await npmScript({ script: "build", label: "Build" }).policy(
          fakeContext(reportEvidence(report({ exitCode: 1 }))),
        )
      ).rationale,
    ).toBe("Build: `npm run build` exited 1. It printed nothing.")
  })

  it("skips a missing script by default and fails it with whenMissing fail", async () => {
    const missing = reportEvidence(report({ state: "missing", exitCode: null }))
    expect((await npmScript({ script: "build" }).policy(fakeContext(missing))).outcome).toBe("pass")
    expect(
      (await npmScript({ script: "build", whenMissing: "fail" }).policy(fakeContext(missing)))
        .outcome,
    ).toBe("fail")
  })

  it("fails with an actionable message when repo-contract is not on PATH", async () => {
    const result = await npmScript({ script: "build" }).policy(
      fakeContext(enoentEvidence("repo-contract")),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`repo-contract`")
  })

  it("fails with the command's error when it printed no JSON", async () => {
    const result = await npmScript({ script: "build" }).policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 1,
          stderr: "repo-contract npm-script: cannot read package.json",
          output: { format: "json", success: false, error: "Unexpected end of JSON input" },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "build: `repo-contract npm-script` printed no readable report.\nrepo-contract npm-script: cannot read package.json",
    })
  })

  it("trims stderr, and adds no line when stderr is empty, when it printed no JSON", async () => {
    const unreadable = (stderr: string) =>
      npmScript({ script: "build" }).policy(
        fakeContext(
          fakeCheckEvidence({
            exitCode: 1,
            stderr,
            output: { format: "json", success: false, error: "Unexpected end of JSON input" },
          }),
        ),
      )
    expect((await unreadable("\n  boom\n")).rationale).toBe(
      "build: `repo-contract npm-script` printed no readable report.\nboom",
    )
    expect((await unreadable("")).rationale).toBe(
      "build: `repo-contract npm-script` printed no readable report.",
    )
  })

  it("names the label and the npm command when it timed out", async () => {
    const result = await npmScript({ script: "build", label: "Build" }).policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "Build: `npm run build` did not finish: its process exceeded the configured timeout and was terminated.",
    })
  })

  it.each([
    ["empty", "", '""'],
    ["blank", " ", '" "'],
    ["missing", undefined, "undefined"],
  ])("throws RangeError when the config loads, on a script that is %s", (_label, script, shown) => {
    expect(() => npmScript({ script } as NpmScriptOptions)).toThrow(
      new RangeError(`npmScript: script must name an npm script, got ${shown}.`),
    )
  })

  it.each([
    ["-1", -1],
    ["0", 0],
    ["1.5", 1.5],
    ["NaN", Number.NaN],
    ['"1000"', "1000"],
  ])("throws RangeError when the config loads, on a timeoutMs of %s", (shown, timeoutMs) => {
    expect(() => npmScript({ script: "build", timeoutMs } as NpmScriptOptions)).toThrow(
      new RangeError(
        `npmScript: timeoutMs must be a whole number of milliseconds above 0, got ${shown}.`,
      ),
    )
  })

  it("accepts a timeoutMs of 1", () => {
    expect(() => npmScript({ script: "build", timeoutMs: 1 })).not.toThrow()
  })

  it.each([
    ["--x", "--x"],
    ["-C", "-C"],
  ])("throws RangeError when the config loads, on a script of %j", (_label, script) => {
    expect(() => npmScript({ script })).toThrow(
      new RangeError(
        `npmScript: script must not start with "-", which the command reads as an option, got "${script}".`,
      ),
    )
  })

  it("accepts a script with a dash after its first character", () => {
    expect(() => npmScript({ script: "build-docs" })).not.toThrow()
  })

  it.each([
    ["a string", "docs", '"docs"'],
    ["null", null, "null"],
    ["an object", {}, "an object"],
  ])(
    "throws RangeError when the config loads, on a mustNotChange that is %s",
    (_label, mustNotChange, shown) => {
      expect(() => npmScript({ script: "build", mustNotChange } as NpmScriptOptions)).toThrow(
        new RangeError(`npmScript: mustNotChange must be a list of paths, got ${shown}.`),
      )
    },
  )

  it.each([
    ["empty", ["docs", ""], '""'],
    ["not a string", ["docs", 7], "7"],
    ["an option", ["docs", "--timeout"], '"--timeout"'],
    ["a single dash", ["-"], '"-"'],
    ["undefined", ["docs", undefined], "undefined"],
  ])(
    "throws RangeError when the config loads, on a mustNotChange entry that is %s",
    (_label, mustNotChange, shown) => {
      expect(() => npmScript({ script: "build", mustNotChange } as NpmScriptOptions)).toThrow(
        new RangeError(
          `npmScript: each mustNotChange entry must be a non-empty path not starting with "-", got ${shown}.`,
        ),
      )
    },
  )

  it("accepts an empty mustNotChange list and paths with a dash after the first character", () => {
    expect(() => npmScript({ script: "build", mustNotChange: [] })).not.toThrow()
    expect(() => npmScript({ script: "build", mustNotChange: ["docs/a-b", "./-c"] })).not.toThrow()
  })

  it.each([
    ["null", null, "null"],
    ["a string", "build", '"build"'],
    ["missing", undefined, "undefined"],
  ])("throws TypeError when the config loads, on options that are %s", (_label, options, shown) => {
    expect(() => npmScript(options as unknown as NpmScriptOptions)).toThrow(
      new TypeError(`npmScript: options must be an object, got ${shown}.`),
    )
  })
})
