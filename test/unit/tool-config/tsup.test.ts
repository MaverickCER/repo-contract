import { readFileSync } from "node:fs"
import type { Options } from "tsup"
import { describe, expect, it } from "vitest"
import ownTsupConfig from "../../../tsup.config.js"
import { tsupConfig } from "../../../src/tool-config/tsup.js"
import type { PackageManifest } from "../../../src/tool-config/types.js"

const noFiles = (): boolean => false

describe("R3 tsup helper", () => {
  it("entry maps each built name to its source", () => {
    const manifest: PackageManifest = {
      exports: {
        ".": { import: "./dist/index.js", require: "./dist/index.cjs" },
        "./eslint-plugin": "./dist/eslint-plugin/index.js",
        "./schema": "./schemas/report.schema.json",
      },
    }

    const fragment = tsupConfig({
      manifest,
      sources: { ".": "src/core/index.ts" },
      exists: noFiles,
    })

    expect(fragment.entry).toEqual({
      index: "src/core/index.ts",
      "eslint-plugin/index": "src/eslint-plugin.ts",
    })
  })

  it("defaults to esm and cjs, node, node22, sourcemaps and treeshaking", () => {
    const fragment = tsupConfig({ manifest: { exports: "./dist/index.js" }, exists: noFiles })

    expect(fragment).toEqual({
      entry: { index: "src/index.ts" },
      format: ["esm", "cjs"],
      platform: "node",
      target: "node22",
      sourcemap: true,
      treeshake: true,
    })
  })

  it("honours format, platform and target", () => {
    const fragment = tsupConfig({
      manifest: { exports: "./dist/index.js" },
      exists: noFiles,
      format: ["esm"],
      platform: "neutral",
      target: "es2020",
    })

    expect(fragment).toMatchObject({ format: ["esm"], platform: "neutral", target: "es2020" })
  })

  it("rejects an empty format list, which would build nothing", () => {
    expect(() =>
      tsupConfig({ manifest: { exports: "./dist/index.js" }, exists: noFiles, format: [] }),
    ).toThrow("format needs at least one of esm and cjs")
  })

  it("builds repo-contract's own entries from its package.json", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as PackageManifest
    const toolConfig = (name: string): string => `src/tool-config/${name}.ts`

    const fragment = tsupConfig({
      manifest,
      sources: {
        "./config": "src/tool-config/index.ts",
        "./config/knip": toolConfig("knip"),
        "./config/stryker": toolConfig("stryker"),
        "./config/tsup": toolConfig("tsup"),
        "./config/typedoc": toolConfig("typedoc"),
        "./config/vitest": toolConfig("vitest"),
      },
    })

    const own = ownTsupConfig as Options
    expect(fragment.entry).toEqual(own.entry)
    expect(fragment).toMatchObject({
      format: own.format,
      platform: own.platform,
      target: own.target,
      sourcemap: own.sourcemap,
      treeshake: own.treeshake,
    })
  })

  it("spreads into tsup's own Options type", () => {
    const options: Options = {
      ...tsupConfig({ manifest: { exports: "./dist/index.js" }, exists: noFiles }),
      dts: false,
    }

    expect(options.entry).toEqual({ index: "src/index.ts" })
  })
})
