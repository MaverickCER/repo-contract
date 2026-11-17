import { describe, expect, it } from "vitest"
import { entries } from "../../../src/tool-config/entries.js"
import type { PackageManifest } from "../../../src/tool-config/types.js"

/** A probe that knows only the listed files, so no test depends on the real tree. */
function filesOnly(...paths: readonly string[]): (path: string) => boolean {
  const known = new Set(paths)
  return (path) => known.has(path)
}

/** The conditions env-cap and data-cap publish for each code subpath. */
function dualConditions(name: string): unknown {
  return {
    import: {
      "types@>=7": `./dist/${name}.ts7.d.ts`,
      types: `./dist/${name}.d.ts`,
      default: `./dist/${name}.js`,
    },
    require: {
      "types@>=7": `./dist/${name}.ts7.d.cts`,
      types: `./dist/${name}.d.cts`,
      default: `./dist/${name}.cjs`,
    },
  }
}

describe("R3 entries from exports", () => {
  it("maps . to src/index.ts", () => {
    const manifest: PackageManifest = { exports: { ".": dualConditions("index") } }

    expect(entries(manifest, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "index", source: "src/index.ts" },
    ])
  })

  it("maps ./x to src/x/index.ts when it exists, else src/x.ts", () => {
    // data-cap's ./runtime is a directory and ./runtime/cache a file.
    const manifest: PackageManifest = {
      exports: {
        "./runtime": dualConditions("runtime/index"),
        "./runtime/cache": dualConditions("runtime/cache"),
      },
    }

    expect(entries(manifest, { exists: filesOnly("src/runtime/index.ts") })).toEqual([
      { subpath: "./runtime", name: "runtime/index", source: "src/runtime/index.ts" },
      { subpath: "./runtime/cache", name: "runtime/cache", source: "src/runtime/cache.ts" },
    ])
  })

  it("uses sources over the convention, as env-cap's . -> src/runtime/index.ts", () => {
    const manifest: PackageManifest = {
      exports: { ".": dualConditions("index"), "./build": dualConditions("build") },
    }
    const probed: string[] = []
    const exists = (path: string): boolean => {
      probed.push(path)
      return path === "src/build/index.ts"
    }

    expect(entries(manifest, { sources: { ".": "src/runtime/index.ts" }, exists })).toEqual([
      { subpath: ".", name: "index", source: "src/runtime/index.ts" },
      { subpath: "./build", name: "build", source: "src/build/index.ts" },
    ])
    // A listed source is taken as given: the probe never sees it.
    expect(probed).toEqual(["src/build/index.ts"])
  })

  it("names each entry by its built file under dist, nested names included", () => {
    const manifest: PackageManifest = {
      exports: {
        "./eslint-plugin": dualConditions("eslint-plugin/index"),
        "./config/tsup": { import: "./dist/config/tsup.js", require: "./dist/config/tsup.cjs" },
        "./bin": "./lib/cli.mjs",
        "./flat": "./flat.js",
      },
    }

    expect(entries(manifest, { exists: filesOnly() }).map((entry) => entry.name)).toEqual([
      "eslint-plugin/index",
      "config/tsup",
      "cli",
      "flat",
    ])
  })

  it("skips JSON and ./package.json targets", () => {
    const manifest: PackageManifest = {
      exports: {
        ".": dualConditions("index"),
        "./schema": "./schemas/env-cap-report.schema.json",
        "./schema/*": "./schemas/*.schema.json",
        "./styles": "./dist/styles.css",
        "./types-only": { types: "./dist/types-only.d.ts" },
        "./internal/*": null,
        "./package.json": "./package.json",
      },
    }

    expect(entries(manifest, { exists: filesOnly() }).map((entry) => entry.subpath)).toEqual(["."])
  })

  it("reads a string exports and a conditions object alike", () => {
    const viaString = entries({ exports: "./dist/index.js" }, { exists: filesOnly() })
    const viaConditions = entries(
      { exports: { import: "./dist/index.js", require: "./dist/index.cjs" } },
      { exists: filesOnly() },
    )
    const viaFallbackArray = entries(
      { exports: { ".": [{ worker: "./dist/index.worker.json" }, "./dist/index.js"] } },
      { exists: filesOnly() },
    )

    const expected = [{ subpath: ".", name: "index", source: "src/index.ts" }]
    expect(viaString).toEqual(expected)
    expect(viaConditions).toEqual(expected)
    expect(viaFallbackArray).toEqual(expected)
  })

  it("returns . alone from main when exports is absent", () => {
    expect(entries({ main: "./dist/main.cjs" }, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "main", source: "src/index.ts" },
    ])
    expect(entries({ module: "./dist/index.mjs" }, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "index", source: "src/index.ts" },
    ])
  })

  it("reads main without a leading ./ and falls back to it when exports is null", () => {
    expect(entries({ main: "dist/esm/index.js" }, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "esm/index", source: "src/index.ts" },
    ])
    expect(entries({ exports: null, main: "./dist/index.cjs" }, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "index", source: "src/index.ts" },
    ])
  })

  it("walks conditions nested 32 deep and rejects one level more", () => {
    const nested = (depth: number): unknown =>
      depth === 0 ? "./dist/index.js" : { default: nested(depth - 1) }

    expect(entries({ exports: { ".": nested(32) } }, { exists: filesOnly() })).toEqual([
      { subpath: ".", name: "index", source: "src/index.ts" },
    ])
    expect(() => entries({ exports: { ".": nested(33) } }, { exists: filesOnly() })).toThrow(
      "package.json exports nests conditions deeper than 32 levels",
    )
  })

  it("rejects exports that mixes subpaths and conditions", () => {
    const manifest: PackageManifest = {
      exports: { ".": "./dist/index.js", import: "./dist/index.js" },
    }

    expect(() => entries(manifest, { exists: filesOnly() })).toThrow(
      "package.json exports mixes subpaths and conditions",
    )
  })

  it("returns nothing when the manifest names no code entry", () => {
    expect(entries({ name: "empty" }, { exists: filesOnly() })).toEqual([])
    expect(entries({ exports: "./data.json" }, { exists: filesOnly() })).toEqual([])
    expect(entries({ exports: {} }, { exists: filesOnly() })).toEqual([])
  })

  it("honours srcDir", () => {
    const manifest: PackageManifest = {
      exports: { ".": dualConditions("index"), "./node": dualConditions("node") },
    }

    expect(entries(manifest, { srcDir: "./lib/", exists: filesOnly("lib/node/index.ts") })).toEqual(
      [
        { subpath: ".", name: "index", source: "lib/index.ts" },
        { subpath: "./node", name: "node", source: "lib/node/index.ts" },
      ],
    )
  })

  it("rejects a sources key that exports does not list", () => {
    const manifest: PackageManifest = { exports: { ".": dualConditions("index") } }

    expect(() => entries(manifest, { sources: { "./runtim": "src/runtime/index.ts" } })).toThrow(
      'sources names "./runtim", which package.json exports does not list',
    )
  })

  it("rejects a wildcard subpath with a JavaScript target", () => {
    const manifest: PackageManifest = { exports: { "./utils/*": "./dist/utils/*.js" } }

    expect(() => entries(manifest, { exists: filesOnly() })).toThrow(
      'cannot expand the wildcard subpath "./utils/*"',
    )
  })

  it("rejects two subpaths that build the same file", () => {
    const manifest: PackageManifest = {
      exports: { ".": "./dist/index.js", "./main": "./dist/index.js" },
    }

    expect(() => entries(manifest, { exists: filesOnly() })).toThrow(
      '"./main" and "." both build "index"',
    )
  })
})
