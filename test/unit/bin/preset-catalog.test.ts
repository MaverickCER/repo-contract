import { describe, expect, it } from "vitest"
import * as presets from "../../../src/presets/index.js"
import { TIER_NAMES, tierChecks } from "../../../src/tiers/index.js"
import {
  AGENT_COMMAND,
  detectPresets,
  FACTORY_PRESETS,
  DIST_OUTPUT,
  missingTierTools,
  PRESET_DEPENDENCIES,
  PUBLISHED_PACKAGE,
  NPM_LOCKFILE,
  QUICK_START_BLOCK,
  TIER_CHECK_PRESETS,
  TIER_ONLY_PRESETS,
  TIER_PRESET_NAMES,
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
    // package.json is parsed JSON, so `files` can hold anything.
    expect(detects({ files: [null, true, 0, "src"] as unknown as string[] })).toBe(false)
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

  it("produces a valid config for a private repository with none of the 19 tool-specific dependencies: only securityDeps", () => {
    const { detected, skipped } = detectPresets({
      private: true,
      devDependencies: { "some-unrelated-tool": "1.0.0" },
    })
    expect(detected).toEqual(["securityDeps"])
    // The 19 tools (coverage, crap and mutation among them, which flat init leaves to tiers),
    // plus bundledDependencies (private), and aiReview, quickStart, sbom and npmScript, which
    // are never detected.
    expect(skipped).toHaveLength(24)
  })
})

describe("tier-only presets", () => {
  it("never detects coverage, crap or mutation: only a tier writes the order they need", () => {
    expect([...TIER_ONLY_PRESETS].sort()).toEqual(["coverage", "crap", "mutation"])
    const { detected, skipped } = detectPresets({
      devDependencies: {
        vitest: "^4.0.0",
        "@vitest/coverage-v8": "^4.0.0",
        "@danibram/crap4ts": "^1.0.0",
        "@stryker-mutator/core": "^9.0.0",
      },
    })
    expect(detected).toContain("test")
    for (const preset of TIER_ONLY_PRESETS) {
      expect(detected).not.toContain(preset)
      expect(skipped).toContainEqual({ preset, dependency: PRESET_DEPENDENCIES[preset] })
    }
  })
})

describe("flat init's presets", () => {
  // detectPresets checks one devDependency per preset. A second package would go unchecked.
  it("each name at most one npm package, so detection checks every one", () => {
    for (const [preset, dependency] of Object.entries(PRESET_DEPENDENCIES)) {
      if (TIER_ONLY_PRESETS.has(preset as keyof typeof PRESET_DEPENDENCIES)) continue
      expect(dependency === null || typeof dependency === "string").toBe(true)
    }
  })

  it("detects a single-package preset by that package alone", () => {
    expect(detectPresets({ devDependencies: { knip: "^5.0.0" } }).detected).toContain("deadCode")
    expect(detectPresets({ devDependencies: { jscpd: "^4.0.0" } }).detected).not.toContain(
      "deadCode",
    )
  })
})

describe("TIER_PRESET_NAMES and TIER_CHECK_PRESETS", () => {
  it("names the same tiers as repo-contract/tiers, loosest first", () => {
    expect(TIER_PRESET_NAMES).toEqual(TIER_NAMES)
  })

  it("maps every check of the strict tier, and nothing else, to a published preset", () => {
    expect(Object.keys(TIER_CHECK_PRESETS).sort()).toEqual([...tierChecks("strict")].sort())
    for (const preset of Object.values(TIER_CHECK_PRESETS)) {
      expect(Object.keys(PRESET_DEPENDENCIES)).toContain(preset)
    }
  })
})

describe("missingTierTools", () => {
  it("lists each check whose npm tool is not a devDependency, in check order", () => {
    expect(
      missingTierTools(["Format", "Lint", "Typecheck", "Tests"], {
        devDependencies: { prettier: "^3.0.0", typescript: "^5.0.0" },
      }),
    ).toEqual([
      { check: "Lint", preset: "lint", dependency: "eslint" },
      { check: "Tests", preset: "test", dependency: "vitest" },
    ])
  })

  it("skips checks that need no npm package: npm itself, a build script, dist or a README block", () => {
    expect(
      missingTierTools(
        ["SecurityDeps", "Build", "DistNoUrls", "BundledDependencies", "QuickStart"],
        {},
      ),
    ).toEqual([])
  })

  it("names the coverage, crap and mutation tools a strict tier needs", () => {
    const missing = missingTierTools(["Coverage", "Crap", "Mutation"], {})
    expect(missing.map(({ dependency }) => dependency)).toEqual([
      "@vitest/coverage-v8",
      "@danibram/crap4ts",
      "@stryker-mutator/core",
      "@stryker-mutator/vitest-runner",
    ])
  })

  // strykerConfig() sets testRunner "vitest", which Stryker loads only from the runner plugin.
  it("names only the Stryker package that is missing", () => {
    expect(
      missingTierTools(["Mutation"], { devDependencies: { "@stryker-mutator/core": "^9.0.0" } }),
    ).toEqual([
      { check: "Mutation", preset: "mutation", dependency: "@stryker-mutator/vitest-runner" },
    ])
    expect(
      missingTierTools(["Mutation"], {
        devDependencies: {
          "@stryker-mutator/core": "^9.0.0",
          "@stryker-mutator/vitest-runner": "^9.0.0",
        },
      }),
    ).toEqual([])
  })

  it("reads devDependencies only, like detectPresets", () => {
    expect(missingTierTools(["Lint"], { dependencies: { eslint: "^9.0.0" } })).toEqual([
      { check: "Lint", preset: "lint", dependency: "eslint" },
    ])
  })

  it("ignores an id that is not a tier check", () => {
    expect(missingTierTools(["Nonsense"], {})).toEqual([])
  })
})
