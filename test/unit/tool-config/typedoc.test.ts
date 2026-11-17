import type { TypeDocOptions } from "typedoc"
import { describe, expect, it } from "vitest"
import { excludeGlobs } from "../../../src/tool-config/exclude.js"
import type { PackageManifest } from "../../../src/tool-config/types.js"
import { typedocConfig } from "../../../src/tool-config/typedoc.js"

const manifest: PackageManifest = {
  exports: {
    ".": { import: "./dist/index.js", require: "./dist/index.cjs" },
    "./runtime": "./dist/runtime/index.js",
    "./runtime/cache": "./dist/runtime/cache.js",
    "./schema": "./schemas/report.schema.json",
    "./package.json": "./package.json",
  },
}
const exists = (path: string): boolean => path === "src/runtime/index.ts"

describe("R3 typedoc helper", () => {
  it("entryPoints lists every code entry's source", () => {
    const fragment = typedocConfig({ manifest, sources: { ".": "src/core/index.ts" }, exists })

    expect(fragment.entryPoints).toEqual([
      "src/core/index.ts",
      "src/runtime/index.ts",
      "src/runtime/cache.ts",
    ])
  })

  it("exclude is the one exclude list", () => {
    const fragment = typedocConfig({ manifest, exists, exclude: ["src/_ipc/**"] })

    expect(fragment.exclude).toEqual(excludeGlobs(["src/_ipc/**"]))
  })

  it("spreads into TypeDoc's own options type", () => {
    const options: Partial<TypeDocOptions> = {
      ...typedocConfig({ manifest, exists }),
      out: "docs/api",
    }

    expect(options.entryPoints).toHaveLength(3)
  })
})
