import { standardChecks } from "internal-package-contract/checks/standard"
import { describe, expect, it } from "vitest"
import { STANDARD_COVERAGE } from "../../../checks/standard-coverage.js"
import config from "../../../repo-contract.config.js"

describe("checks/standard-coverage.ts: every standard check is run here or left out with a reason", () => {
  it("names exactly the checks of the standard", () => {
    expect(Object.keys(STANDARD_COVERAGE).sort()).toEqual(Object.keys(standardChecks()).sort())
  })

  it("names only check ids this repository's config declares", () => {
    const ids = new Set(Object.keys(config.checks))
    for (const [name, coverage] of Object.entries(STANDARD_COVERAGE)) {
      if ("runs" in coverage)
        expect(ids.has(coverage.runs), `${name} -> ${coverage.runs}`).toBe(true)
      else expect(coverage.omitted.length, `${name} reason`).toBeGreaterThan(20)
    }
  })
})
