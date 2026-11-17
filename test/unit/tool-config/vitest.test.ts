import { describe, expect, it } from "vitest"
import type { ViteUserConfig } from "vitest/config"
import { excludeGlobs } from "../../../src/tool-config/exclude.js"
import { vitestConfig } from "../../../src/tool-config/vitest.js"

describe("R3 vitest helper", () => {
  it("coverage reporter includes json-summary and json", () => {
    const { reporter } = vitestConfig().test.coverage

    expect(reporter).toEqual(["text", "html", "lcov", "json", "json-summary"])
  })

  it("coverage writes to coverage/, where the coverage and crap presets read", () => {
    // json-summary writes coverage/coverage-summary.json and json writes coverage/coverage-final.json.
    expect(vitestConfig().test.coverage.reportsDirectory).toBe("coverage")
  })

  it("coverage include is the source directory and exclude is the one exclude list", () => {
    const { coverage } = vitestConfig({ srcDir: "lib/", exclude: ["lib/types.ts"] }).test

    expect(coverage.include).toEqual(["lib/**/*.{ts,tsx}"])
    expect(coverage.exclude).toEqual(excludeGlobs(["lib/types.ts"]))
  })

  it("include defaults to test/**/*.test.ts and honours the option", () => {
    expect(vitestConfig().test.include).toEqual(["test/**/*.test.ts"])
    expect(vitestConfig({ include: ["spec/**/*.spec.ts"] }).test.include).toEqual([
      "spec/**/*.spec.ts",
    ])
  })

  it("reportOnFailure is true", () => {
    expect(vitestConfig().test.coverage.reportOnFailure).toBe(true)
    expect(vitestConfig().test.coverage.provider).toBe("v8")
  })

  it("passes as Vitest's own config type", () => {
    const config: ViteUserConfig = vitestConfig({ exclude: ["src/types.ts"] })

    expect(config.test?.coverage?.provider).toBe("v8")
  })
})
