import { describe, expect, it } from "vitest"
import * as presets from "../../../src/presets/index.js"
import {
  detectPresets,
  FACTORY_PRESETS,
  PRESET_DEPENDENCIES,
} from "../../../bin/preset-catalog.mjs"

describe("PRESET_DEPENDENCIES", () => {
  it("has exactly one entry per preset published from src/presets/index.ts -- no drift", () => {
    const publishedPresetNames = Object.keys(presets).sort()
    const catalogNames = Object.keys(PRESET_DEPENDENCIES).sort()
    expect(catalogNames).toEqual(publishedPresetNames)
  })
})

describe("FACTORY_PRESETS", () => {
  it("only names presets that are actually functions, not plain CheckDefinitionConfig objects", () => {
    const presetsByName: Record<string, unknown> = { ...presets }
    for (const name of FACTORY_PRESETS) {
      expect(typeof presetsByName[name]).toBe("function")
    }
  })
})

describe("detectPresets", () => {
  it("always detects securityDeps, regardless of declared dependencies", () => {
    const { detected } = detectPresets({})
    expect(detected).toContain("securityDeps")
  })

  it("detects a preset only when its mapped dependency is declared", () => {
    const { detected, skipped } = detectPresets({ devDependencies: { vitest: "^2.0.0" } })
    expect(detected).toContain("test")
    expect(skipped.map((s) => s.preset)).toContain("lint")
  })

  it("checks dependencies as well as devDependencies", () => {
    const { detected } = detectPresets({ dependencies: { eslint: "^9.0.0" } })
    expect(detected).toContain("lint")
  })

  it("preserves PRESET_DEPENDENCIES's declared order in its output", () => {
    const { detected } = detectPresets({
      devDependencies: { typescript: "^5.0.0", vitest: "^2.0.0" },
    })
    expect(detected).toEqual(["test", "typecheck", "securityDeps"])
  })

  it("reports the missing dependency name for every skipped preset", () => {
    const { skipped } = detectPresets({})
    const lint = skipped.find((s) => s.preset === "lint")
    expect(lint?.dependency).toBe("eslint")
  })

  it("produces a valid config for a repository with none of the 15 tool-specific dependencies -- only securityDeps", () => {
    const { detected, skipped } = detectPresets({
      devDependencies: { "some-unrelated-tool": "1.0.0" },
    })
    expect(detected).toEqual(["securityDeps"])
    expect(skipped).toHaveLength(15)
  })
})
