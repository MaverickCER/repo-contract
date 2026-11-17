import type { KnipConfiguration } from "knip"
import { describe, expect, it } from "vitest"
import { excludeGlobs, negateGlobs } from "../../../src/tool-config/exclude.js"
import { knipConfig } from "../../../src/tool-config/knip.js"
import type { PackageManifest } from "../../../src/tool-config/types.js"

const manifest: PackageManifest = {
  exports: {
    ".": "./dist/index.js",
    "./node": "./dist/node.js",
    "./schema": "./schemas/report.schema.json",
  },
}
const exists = (path: string): boolean => path === "src/node/index.ts"

describe("R3 knip helper", () => {
  it("entry lists every code entry's source plus extraEntries", () => {
    const fragment = knipConfig({
      manifest,
      sources: { ".": "src/runtime/index.ts" },
      exists,
      extraEntries: ["src/cli/index.ts", "scripts/*.mjs", "src/node/index.ts"],
    })

    expect(fragment.entry).toEqual([
      "src/runtime/index.ts",
      "src/node/index.ts",
      "src/cli/index.ts",
      "scripts/*.mjs",
    ])
  })

  it("project is the source glob followed by the negated exclude list", () => {
    const fragment = knipConfig({ manifest, exists, exclude: ["src/_ipc/**"] })

    expect(fragment.project).toEqual([
      "src/**/*.{ts,tsx}",
      ...negateGlobs(excludeGlobs(["src/_ipc/**"])),
    ])
  })

  it("project follows srcDir", () => {
    expect(knipConfig({ manifest, exists, srcDir: "lib" }).project[0]).toBe("lib/**/*.{ts,tsx}")
  })

  it("spreads into knip's own configuration type", () => {
    const config: KnipConfiguration = { ...knipConfig({ manifest, exists }), ignore: ["dist/**"] }

    expect(config.entry).toEqual(["src/index.ts", "src/node/index.ts"])
  })
})
