import { describe, expect, it } from "vitest"
import * as presets from "../../../src/presets/index.js"
import {
  AGENT_COMMAND,
  detectPresets,
  FACTORY_PRESETS,
  DIST_OUTPUT,
  PRESET_DEPENDENCIES,
  PUBLISHED_PACKAGE,
  NPM_LOCKFILE,
  QUICK_START_BLOCK,
} from "../../../bin/preset-catalog.mjs"

describe("PRESET_DEPENDENCIES", () => {
  it("has exactly one entry per preset published from src/presets/index.ts: no drift", () => {
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

  it("ignores dependencies: only devDependencies count, matching every preset's own documented convention", () => {
    const { detected, skipped } = detectPresets({ dependencies: { eslint: "^9.0.0" } })
    expect(detected).not.toContain("lint")
    expect(skipped.map((s) => s.preset)).toContain("lint")
  })

  it("preserves PRESET_DEPENDENCIES's declared order in its output", () => {
    const { detected } = detectPresets({
      devDependencies: { typescript: "^5.0.0", vitest: "^2.0.0" },
    })
    expect(detected).toEqual(["test", "typecheck", "bundledDependencies", "securityDeps"])
  })

  it("reports the missing dependency name for every skipped preset", () => {
    const { skipped } = detectPresets({})
    const lint = skipped.find((s) => s.preset === "lint")
    expect(lint?.dependency).toBe("eslint")
  })

  it("never detects aiReview, which runs the agent a consumer names", () => {
    expect(PRESET_DEPENDENCIES.aiReview).toBe(AGENT_COMMAND)
    const { detected, skipped } = detectPresets({ devDependencies: { [AGENT_COMMAND]: "1.0.0" } })
    expect(detected).not.toContain("aiReview")
    expect(skipped).toContainEqual({ preset: "aiReview", dependency: AGENT_COMMAND })
  })

  it("detects distNoUrls only when package.json publishes a built dist/", () => {
    const detects = (packageJson: Parameters<typeof detectPresets>[0]): boolean =>
      detectPresets(packageJson).detected.includes("distNoUrls")
    expect(PRESET_DEPENDENCIES.distNoUrls).toBe(DIST_OUTPUT)
    expect(detects({})).toBe(false)
    expect(detects({ main: "./dist/index.cjs" })).toBe(true)
    expect(detects({ module: "dist/index.js" })).toBe(true)
    expect(detects({ types: "./dist/index.d.ts" })).toBe(true)
    expect(detects({ files: ["README.md", "dist"] })).toBe(true)
    expect(detects({ files: ["dist/"] })).toBe(true)
    expect(detects({ exports: { ".": { import: { default: "./dist/index.js" } } } })).toBe(true)
    expect(detects({ exports: { ".": ["./dist/index.js"] } })).toBe(true)
  })

  it("does not detect distNoUrls from look-alike paths, devDependencies, or non-string values", () => {
    const detects = (packageJson: Parameters<typeof detectPresets>[0]): boolean =>
      detectPresets(packageJson).detected.includes("distNoUrls")
    expect(detects({ main: "./src/index.js" })).toBe(false)
    expect(detects({ main: "./distribution/index.js" })).toBe(false)
    expect(detects({ main: "./lib/dist/index.js" })).toBe(false)
    expect(detects({ devDependencies: { tsup: "^8.0.0" } })).toBe(false)
    expect(detects({ exports: { ".": null } })).toBe(false)
    expect(detects({ exports: 7 })).toBe(false)
    expect(detectPresets({}).skipped.find((s) => s.preset === "distNoUrls")?.dependency).toBe(
      DIST_OUTPUT,
    )
  })

  it("detects bundledDependencies for every package npm can publish, and skips a private one", () => {
    const detects = (packageJson: Parameters<typeof detectPresets>[0]): boolean =>
      detectPresets(packageJson).detected.includes("bundledDependencies")
    expect(PRESET_DEPENDENCIES.bundledDependencies).toBe(PUBLISHED_PACKAGE)
    expect(detects({})).toBe(true)
    expect(detects({ private: false })).toBe(true)
    expect(detects({ private: "true" })).toBe(true)
    expect(detects({ private: true })).toBe(false)
    expect(
      detectPresets({ private: true }).skipped.find((s) => s.preset === "bundledDependencies"),
    ).toEqual({ preset: "bundledDependencies", dependency: PUBLISHED_PACKAGE })
  })

  it("never detects quickStart, which runs the README block a consumer marks", () => {
    expect(PRESET_DEPENDENCIES.quickStart).toBe(QUICK_START_BLOCK)
    const { detected, skipped } = detectPresets({
      devDependencies: { [QUICK_START_BLOCK]: "1.0.0" },
    })
    expect(detected).not.toContain("quickStart")
    expect(skipped).toContainEqual({ preset: "quickStart", dependency: QUICK_START_BLOCK })
  })

  it("never detects sbom, which fails until the consumer commits its documents", () => {
    expect(PRESET_DEPENDENCIES.sbom).toBe(NPM_LOCKFILE)
    const { detected, skipped } = detectPresets({
      devDependencies: { [NPM_LOCKFILE]: "1.0.0" },
    })
    expect(detected).not.toContain("sbom")
    expect(skipped).toContainEqual({ preset: "sbom", dependency: NPM_LOCKFILE })
  })

  it("produces a valid config for a private repository with none of the 16 tool-specific dependencies: only securityDeps", () => {
    const { detected, skipped } = detectPresets({
      private: true,
      devDependencies: { "some-unrelated-tool": "1.0.0" },
    })
    expect(detected).toEqual(["securityDeps"])
    // The 16 tools, plus bundledDependencies (private), and aiReview, quickStart and sbom, which
    // are never detected.
    expect(skipped).toHaveLength(20)
  })
})
