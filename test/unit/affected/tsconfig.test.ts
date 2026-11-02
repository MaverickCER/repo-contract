import ts, { ScriptTarget } from "typescript"
import { describe, expect, it } from "vitest"
import { loadCompilerOptions } from "../../../src/affected/index.js"

const load = (files: Record<string, string>, file?: string) =>
  loadCompilerOptions({
    ts,
    readFile: async (path) => files[path],
    ...(file === undefined ? {} : { file }),
  })

describe("loadCompilerOptions", () => {
  it("uses defaults when there is no tsconfig", async () => {
    expect(await load({})).toEqual({})
  })

  it("reads paths and baseUrl", async () => {
    const result = await load({
      "tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }',
    })
    expect(result).toMatchObject({ options: { paths: { "~/*": ["src/*"] } } })
  })

  it("accepts comments and trailing commas", async () => {
    const result = await load({
      "tsconfig.json": '{\n // c\n "compilerOptions": { "paths": { "a": ["b"], }, },\n}',
    })
    expect(result).toMatchObject({ options: { paths: { a: ["b"] } } })
  })

  it("follows a relative extends, with or without the extension", async () => {
    for (const spec of ["./base.json", "./base"]) {
      const result = await load({
        "tsconfig.json": `{ "extends": "${spec}" }`,
        "base.json": '{ "compilerOptions": { "paths": { "@/*": ["src/*"] }, "baseUrl": "." } }',
      })
      expect(result).toMatchObject({ options: { paths: { "@/*": ["src/*"] } } })
    }
  })

  it("follows a chain, a child overriding its parent", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": "./mid.json", "compilerOptions": { "strict": true } }',
      "mid.json": '{ "extends": "./root.json", "compilerOptions": { "target": "ES2020" } }',
      "root.json": '{ "compilerOptions": { "paths": { "a": ["x"] }, "target": "ES5" } }',
    })
    expect(result).toMatchObject({
      options: { paths: { a: ["x"] }, strict: true, target: ScriptTarget.ES2020 },
    })
  })

  it("follows an extends in a subdirectory", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": "./config/base.json" }',
      "config/base.json": '{ "extends": "../root.json" }',
      "root.json": '{ "compilerOptions": { "paths": { "a": ["x"] } } }',
    })
    expect(result).toMatchObject({ options: { paths: { a: ["x"] } } })
  })

  it("follows a list of extends", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": ["./a.json", "./b.json"] }',
      "a.json": '{ "compilerOptions": { "paths": { "a": ["x"] } } }',
      "b.json": '{ "compilerOptions": { "strict": true } }',
    })
    expect(result).toMatchObject({ options: { paths: { a: ["x"] }, strict: true } })
  })

  it("resolves a package extends from node_modules", async () => {
    for (const [spec, location] of [
      ["@tsconfig/node22", "node_modules/@tsconfig/node22/tsconfig.json"],
      ["@tsconfig/node22/tsconfig.json", "node_modules/@tsconfig/node22/tsconfig.json"],
    ] as const) {
      const result = await load({
        "tsconfig.json": `{ "extends": "${spec}" }`,
        [location]: '{ "compilerOptions": { "strict": true } }',
      })
      expect(result).toMatchObject({ options: { strict: true } })
    }
  })

  it("reads the file it is told to", async () => {
    const result = await load(
      { "config/tsconfig.app.json": '{ "compilerOptions": { "paths": { "a": ["x"] } } }' },
      "config/tsconfig.app.json",
    )
    expect(result).toMatchObject({ options: { paths: { a: ["x"] } } })
  })

  it("does not hang on a cycle", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": "./a.json" }',
      "a.json": '{ "extends": "./tsconfig.json", "compilerOptions": { "strict": true } }',
    })
    expect(result).toMatchObject({ options: { strict: true } })
  })

  it("does not read a config twice", async () => {
    const reads: string[] = []
    await loadCompilerOptions({
      ts,
      readFile: async (path) => {
        reads.push(path)
        return path === "tsconfig.json"
          ? '{ "extends": ["./a.json", "./a.json"] }'
          : path === "a.json"
            ? "{}"
            : undefined
      },
    })
    expect(reads.sort()).toEqual(["a.json", "tsconfig.json"])
  })

  describe("anything it cannot read makes the answer wider", () => {
    it("reports a config that is not JSON", async () => {
      expect(await load({ "tsconfig.json": "{ nope" })).toEqual({
        because: {
          reason: "tsconfig",
          file: "tsconfig.json",
          to: "full",
          detail: "could not be parsed",
        },
      })
    })

    it("reports an extends that cannot be found", async () => {
      expect(await load({ "tsconfig.json": '{ "extends": "./missing.json" }' })).toEqual({
        because: {
          reason: "tsconfig",
          file: "tsconfig.json",
          to: "full",
          detail: "extends './missing.json', which could not be read",
        },
      })
    })

    it("reports a package extends that is not installed", async () => {
      expect(await load({ "tsconfig.json": '{ "extends": "@tsconfig/node22" }' })).toMatchObject({
        because: {
          reason: "tsconfig",
          detail: "extends '@tsconfig/node22', which could not be read",
        },
      })
    })

    it("reports a broken parent, naming the parent", async () => {
      expect(
        await load({ "tsconfig.json": '{ "extends": "./base.json" }', "base.json": "}" }),
      ).toMatchObject({ because: { file: "base.json", detail: "could not be parsed" } })
    })

    it("reports a file that was asked for but is missing", async () => {
      expect(await load({}, "tsconfig.app.json")).toEqual({
        because: {
          reason: "tsconfig",
          file: "tsconfig.app.json",
          to: "full",
          detail: "could not be read",
        },
      })
    })

    it("reports project references it cannot follow", async () => {
      expect(
        await load({
          "tsconfig.json": '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
        }),
      ).toEqual({
        because: {
          reason: "tsconfig",
          file: "tsconfig.json",
          to: "full",
          detail: "uses project references; name the config that holds the paths with --tsconfig",
        },
      })
    })

    it("accepts references when the config itself holds the paths", async () => {
      const result = await load({
        "tsconfig.json":
          '{ "compilerOptions": { "paths": { "a": ["x"] } }, "references": [{ "path": "./other" }] }',
      })
      expect(result).toMatchObject({ options: { paths: { a: ["x"] } } })
    })
  })
})

describe("loadCompilerOptions: details", () => {
  it("follows an extends that climbs out of the config's directory", async () => {
    const result = await load(
      {
        "cfg/tsconfig.json": '{ "extends": "../base.json" }',
        "base.json": '{ "compilerOptions": { "strict": true } }',
      },
      "cfg/tsconfig.json",
    )
    expect(result).toMatchObject({ options: { strict: true } })
  })

  it("does not take a package called '..x' or 'a../' for a relative path", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": "x../tsconfig.json" }',
      "node_modules/x../tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    })
    expect(result).toMatchObject({ options: { strict: true } })
  })

  it("refuses a config whose JSON is not an object", async () => {
    for (const text of ["null", "5", '"text"', "true"]) {
      const result = await load({ "tsconfig.json": text })
      expect(result).toEqual({
        because: {
          reason: "tsconfig",
          file: "tsconfig.json",
          to: "full",
          detail: "could not be parsed",
        },
      })
    }
  })

  it("accepts an empty list of references", async () => {
    expect(await load({ "tsconfig.json": '{ "references": [] }' })).toMatchObject({ options: {} })
    expect(await load({ "tsconfig.json": '{ "references": [{ "path": "./a" }] }' })).toMatchObject({
      because: { reason: "tsconfig" },
    })
  })

  it("reads a config in a subdirectory relative to that directory", async () => {
    const result = await load(
      {
        "cfg/tsconfig.app.json":
          '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["x/*"] } } }',
      },
      "cfg/tsconfig.app.json",
    )
    expect(result).toMatchObject({ options: { baseUrl: "/cfg", paths: { "~/*": ["x/*"] } } })
  })

  it("reads a config at the root relative to the root", async () => {
    const result = await load({ "tsconfig.json": '{ "compilerOptions": { "baseUrl": "." } }' })
    expect(result).toMatchObject({ options: { baseUrl: "/" } })
  })

  it("keeps two configs whose names differ only in case apart", async () => {
    const result = await load({
      "tsconfig.json": '{ "extends": "./Base.json" }',
      "Base.json": '{ "extends": "./base.json", "compilerOptions": { "strict": true } }',
      "base.json": '{ "compilerOptions": { "noImplicitAny": true } }',
    })
    expect(result).toMatchObject({ options: { strict: true, noImplicitAny: true } })
  })

  it("stops reading after a bounded number of configs rather than following a runaway chain", async () => {
    const files: Record<string, string> = { "tsconfig.json": '{ "extends": "./c1.json" }' }
    for (let index = 1; index <= 70; index += 1) {
      files[`c${String(index)}.json`] = `{ "extends": "./c${String(index + 1)}.json" }`
    }
    expect(await load(files)).toEqual({
      because: {
        reason: "tsconfig",
        file: "tsconfig.json",
        to: "full",
        detail: "extends more than 64 configs",
      },
    })
  })

  it("reads a chain of exactly the most it allows", async () => {
    const files: Record<string, string> = { "tsconfig.json": '{ "extends": "./c1.json" }' }
    for (let index = 1; index < 63; index += 1) {
      files[`c${String(index)}.json`] = `{ "extends": "./c${String(index + 1)}.json" }`
    }
    files["c63.json"] = '{ "compilerOptions": { "strict": true } }'
    expect(await load(files)).toMatchObject({ options: { strict: true } })
    files["c63.json"] = '{ "extends": "./c64.json" }'
    files["c64.json"] = "{}"
    expect(await load(files)).toMatchObject({ because: { detail: "extends more than 64 configs" } })
  })

  it("reads the config again for no reason when a cycle repeats it", async () => {
    const reads: string[] = []
    await loadCompilerOptions({
      ts,
      readFile: async (path) => {
        reads.push(path)
        return path === "tsconfig.json"
          ? '{ "extends": "./a.json" }'
          : '{ "extends": "./tsconfig.json" }'
      },
    })
    expect(reads.sort()).toEqual(["a.json", "tsconfig.json"])
  })
})

describe("loadCompilerOptions: relative extends from a nested config", () => {
  it("resolves ../ against the config's own directory, not node_modules", async () => {
    const result = await load(
      {
        "cfg/sub/tsconfig.json": '{ "extends": "../base.json" }',
        "cfg/base.json": '{ "compilerOptions": { "strict": true } }',
        "base.json": '{ "compilerOptions": { "noImplicitAny": true } }',
      },
      "cfg/sub/tsconfig.json",
    )
    expect(result).toMatchObject({ options: { strict: true } })
    expect(
      (result as { options: { noImplicitAny?: boolean } }).options.noImplicitAny,
    ).toBeUndefined()
  })
})
