import type { PartialStrykerOptions } from "@stryker-mutator/api/core"
import { describe, expect, it } from "vitest"
import { excludeGlobs, negateGlobs } from "../../../src/tool-config/exclude.js"
import { strykerConfig } from "../../../src/tool-config/stryker.js"

describe("R3 stryker helper", () => {
  it("mutate is the source glob followed by the negated exclude list", () => {
    const exclude = ["src/types.ts", "src/_ipc/**"]

    expect(strykerConfig({ exclude }).mutate).toEqual([
      "src/**/*.{ts,tsx}",
      ...negateGlobs(excludeGlobs(exclude)),
    ])
    expect(strykerConfig({ srcDir: "./lib" }).mutate[0]).toBe("lib/**/*.{ts,tsx}")
  })

  it("incremental is false", () => {
    expect(strykerConfig().incremental).toBe(false)
  })

  it("jsonReporter writes reports/mutation/mutation.json, which the mutation preset reads", () => {
    const fragment = strykerConfig()

    expect(fragment.jsonReporter).toEqual({ fileName: "reports/mutation/mutation.json" })
    expect(fragment.reporters).toContain("json")
  })

  it("concurrency and timeoutMS default to 4 and 20000 and honour the options", () => {
    expect(strykerConfig()).toMatchObject({ concurrency: 4, timeoutMS: 20_000 })
    expect(strykerConfig({ concurrency: 1, timeoutMS: 60_000 })).toMatchObject({
      concurrency: 1,
      timeoutMS: 60_000,
    })
  })

  it("rejects a concurrency or timeout that is not a positive whole number", () => {
    expect(() => strykerConfig({ concurrency: 0 })).toThrow(
      "concurrency must be a positive whole number; got 0",
    )
    expect(() => strykerConfig({ concurrency: 1.5 })).toThrow("concurrency must be")
    expect(() => strykerConfig({ timeoutMS: -1 })).toThrow(
      "timeoutMS must be a positive whole number; got -1",
    )
    expect(() => strykerConfig({ timeoutMS: Number.NaN })).toThrow("timeoutMS must be")
  })

  it("sets the runner settings rc, env-cap and data-cap share today", () => {
    expect(strykerConfig()).toEqual({
      testRunner: "vitest",
      coverageAnalysis: "perTest",
      ignoreStatic: true,
      incremental: false,
      mutate: ["src/**/*.{ts,tsx}", ...negateGlobs(excludeGlobs())],
      reporters: ["json", "progress", "clear-text"],
      jsonReporter: { fileName: "reports/mutation/mutation.json" },
      tempDirName: ".stryker-tmp",
      concurrency: 4,
      timeoutMS: 20_000,
      dryRunTimeoutMinutes: 10,
    })
  })

  it("passes as Stryker's own options type", () => {
    const options: PartialStrykerOptions = { ...strykerConfig(), packageManager: "npm" }

    expect(options.incremental).toBe(false)
  })
})
