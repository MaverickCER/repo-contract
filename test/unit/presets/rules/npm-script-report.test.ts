import { describe, expect, it } from "vitest"
import {
  evaluateNpmScriptReport,
  type NpmScriptReport,
} from "../../../../src/presets/rules/npm-script-report.js"

const report = (fields: Partial<NpmScriptReport> = {}): NpmScriptReport => ({
  schemaVersion: 1,
  script: "build",
  state: "ran",
  exitCode: 0,
  timedOut: false,
  changed: [],
  output: "",
  ...fields,
})

const SKIP = { label: "Build", whenMissing: "skip" } as const
const FAIL = { label: "Build", whenMissing: "fail" } as const

describe("R7b npm-script report", () => {
  it("passes a script that exited 0 and changed nothing", () => {
    expect(evaluateNpmScriptReport(report(), SKIP)).toEqual({
      outcome: "pass",
      rationale: "Build: `npm run build` exited 0 and changed no watched path.",
    })
  })

  it("fails a non-zero exit with the printed tail", () => {
    expect(
      evaluateNpmScriptReport(report({ exitCode: 2, output: "tsc: error\nline 2" }), SKIP),
    ).toEqual({
      outcome: "fail",
      rationale: "Build: `npm run build` exited 2. Its last output:\n  tsc: error\n  line 2",
    })
  })

  it("says the script printed nothing when its output is empty", () => {
    expect(evaluateNpmScriptReport(report({ exitCode: 1 }), SKIP).rationale).toBe(
      "Build: `npm run build` exited 1. It printed nothing.",
    )
  })

  it("fails a script that never started, with what it printed", () => {
    expect(
      evaluateNpmScriptReport(report({ exitCode: null, output: "spawn npm ENOENT" }), SKIP),
    ).toEqual({
      outcome: "fail",
      rationale:
        "Build: `npm run build` did not start or was killed by a signal. Its last output:\n  spawn npm ENOENT",
    })
  })

  it("fails when a mustNotChange path changed and names it", () => {
    expect(
      evaluateNpmScriptReport(
        report({ changed: ["docs/api/a.md", "docs/api/b.md"], output: "wrote 2" }),
        SKIP,
      ),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "Build: `npm run build` changed 2 file(s) it must leave as committed, so the committed copy is stale. Run `npm run build` and commit the result:",
        "- docs/api/a.md",
        "- docs/api/b.md",
      ].join("\n"),
    })
  })

  it("reports the exit before the changes when the script failed and changed files", () => {
    expect(evaluateNpmScriptReport(report({ exitCode: 1, changed: ["a"] }), SKIP).rationale).toBe(
      "Build: `npm run build` exited 1. It printed nothing.",
    )
  })

  it("passes a missing script as not applicable with whenMissing skip", () => {
    expect(evaluateNpmScriptReport(report({ state: "missing", exitCode: null }), SKIP)).toEqual({
      outcome: "pass",
      rationale: "Build: package.json has no `build` script, so this check does not apply.",
    })
  })

  it("fails a missing script with whenMissing fail", () => {
    expect(evaluateNpmScriptReport(report({ state: "missing", exitCode: null }), FAIL)).toEqual({
      outcome: "fail",
      rationale: "Build: package.json has no `build` script. Add one so this check can run.",
    })
  })

  it("fails a timed-out script", () => {
    expect(
      evaluateNpmScriptReport(report({ exitCode: null, timedOut: true, output: "slow" }), SKIP),
    ).toEqual({
      outcome: "fail",
      rationale:
        "Build: `npm run build` was stopped when its time budget ran out. Its last output:\n  slow",
    })
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "report"],
    ["an empty object", {}],
    ["schemaVersion 2", { ...report(), schemaVersion: 2 }],
    ["an unknown state", { ...report(), state: "skipped" }],
    ["a string exitCode", { ...report(), exitCode: "0" }],
    ["a missing timedOut", { ...report(), timedOut: undefined }],
    ["changed not an array", { ...report(), changed: "a" }],
    ["changed holding a number", { ...report(), changed: [1] }],
    ["a non-string output", { ...report(), output: 3 }],
    ["a non-string script", { ...report(), script: 3 }],
  ])("fails a malformed report: %s", (_label, value) => {
    expect(evaluateNpmScriptReport(value, SKIP)).toEqual({
      outcome: "fail",
      rationale: "Build: `repo-contract npm-script` printed a report this version cannot read.",
    })
  })

  it("skips a missing script when whenMissing is not given", () => {
    expect(
      evaluateNpmScriptReport(report({ state: "missing", exitCode: null }), { label: "Build" }),
    ).toEqual({
      outcome: "pass",
      rationale: "Build: package.json has no `build` script, so this check does not apply.",
    })
  })
})
