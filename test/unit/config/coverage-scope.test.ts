import { describe, expect, it } from "vitest"
import { COVERAGE_INCLUDE } from "../../../vitest.base.config.js"

// A file Stryker mutates but coverage leaves out escapes the coverage and crap checks. A file
// coverage measures but Stryker skips is tested for reach, never for strength.
describe("coverage and mutation scope", () => {
  it("covers exactly the bin/ files Stryker mutates", async () => {
    const url = new URL("../../../stryker.config.mjs", import.meta.url).href
    const { default: config } = (await import(url)) as { default: { mutate: string[] } }
    const mutatedBin = config.mutate.filter((entry) => entry.startsWith("bin/")).sort()
    const coveredBin = COVERAGE_INCLUDE.filter((entry) => entry.startsWith("bin/")).sort()

    expect(mutatedBin.length).toBeGreaterThan(0)
    expect(coveredBin).toEqual(mutatedBin)
    expect(config.mutate).toContain("src/**/*.ts")
    expect(COVERAGE_INCLUDE).toContain("src/**/*.ts")
  })

  it("mutates and covers the affected, doctor and init commands", async () => {
    const url = new URL("../../../stryker.config.mjs", import.meta.url).href
    const { default: config } = (await import(url)) as { default: { mutate: string[] } }

    for (const file of ["bin/affected-cli.mjs", "bin/doctor-cli.mjs", "bin/init-cli.mjs"]) {
      expect(config.mutate).toContain(file)
      expect(COVERAGE_INCLUDE).toContain(file)
    }
  })

  it("leaves the dispatcher out of both", async () => {
    const url = new URL("../../../stryker.config.mjs", import.meta.url).href
    const { default: config } = (await import(url)) as { default: { mutate: string[] } }

    expect(config.mutate).not.toContain("bin/repo-contract.mjs")
    expect(COVERAGE_INCLUDE).not.toContain("bin/repo-contract.mjs")
  })
})
