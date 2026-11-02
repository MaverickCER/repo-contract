import ts, { createSourceFile } from "typescript"
import { describe, expect, it } from "vitest"
import { analyzeModule } from "../../../src/affected/analyze-module.js"

const analyze = (source: string, path = "m.ts") => analyzeModule(ts, path, source)

describe("analyzeModule: declarations and exports", () => {
  it("records every kind of exported declaration", () => {
    const info = analyze(
      [
        "export function f() {}",
        "export class K {}",
        "export enum E { A }",
        "export type T = 1",
        "export interface I {}",
        "export namespace N { export const x = 1 }",
        "export const a = 1, b = 2",
        "const hidden = 3",
      ].join("\n"),
    )
    expect([...info.exports.keys()].sort()).toEqual(["E", "I", "K", "N", "T", "a", "b", "f"])
    expect([...info.declText.keys()].sort()).toEqual([
      "E",
      "I",
      "K",
      "N",
      "T",
      "a",
      "b",
      "f",
      "hidden",
    ])
    expect(info.exports.get("f")).toEqual({ kind: "local", local: "f" })
    expect(info.parseError).toBe(false)
    expect(info.opaque).toBe(false)
  })

  it("flattens destructuring patterns into their bound names", () => {
    const info = analyze("export const { a, b: [c, , d], ...rest } = source")
    expect([...info.exports.keys()].sort()).toEqual(["a", "c", "d", "rest"])
  })

  it("names anonymous default declarations `default`", () => {
    const fn = analyze("export default function () { return 1 }")
    expect(fn.exports.get("default")).toEqual({ kind: "local", local: "default" })
    expect(fn.declText.has("default")).toBe(true)
    const cls = analyze("export default class {}")
    expect(cls.exports.get("default")).toEqual({ kind: "local", local: "default" })
  })

  it("keeps the name of a named default declaration", () => {
    const info = analyze("export default function main() {}")
    expect(info.exports.get("default")).toEqual({ kind: "local", local: "main" })
    expect(info.exports.has("main")).toBe(false)
  })

  it("records `export default <expression>`", () => {
    const info = analyze("export default 42")
    expect(info.exports.get("default")).toEqual({ kind: "local", local: "default" })
    expect(info.declText.get("default")).toContain("42")
    expect(info.effects).toHaveLength(0)
  })

  it("records `export =` under both its own name and default", () => {
    const info = analyze("const value = 1\nexport = value")
    expect(info.exports.get("export=")).toEqual({ kind: "local", local: "export=" })
    expect(info.exports.get("default")).toEqual({ kind: "local", local: "export=" })
  })

  it("records export lists, aliases and re-exports", () => {
    const info = analyze(
      [
        "const a = 1, b = 2",
        "export { a, b as c }",
        'export { d as e, default } from "./other"',
        'export * from "./star"',
        'export * as ns from "./ns"',
        "export type { T }",
      ].join("\n"),
    )
    expect(info.exports.get("a")).toEqual({ kind: "local", local: "a" })
    expect(info.exports.get("c")).toEqual({ kind: "local", local: "b" })
    expect(info.exports.get("e")).toEqual({ kind: "reexport", from: "./other", name: "d" })
    expect(info.exports.get("default")).toEqual({
      kind: "reexport",
      from: "./other",
      name: "default",
    })
    expect(info.exports.get("ns")).toEqual({ kind: "reexport", from: "./ns", name: "*" })
    expect(info.exports.get("T")).toEqual({ kind: "local", local: "T" })
    expect(info.stars).toEqual(["./star"])
  })
})

describe("analyzeModule: imports", () => {
  it("records default, named, aliased and namespace bindings", () => {
    const info = analyze(
      'import d, { x, y as z } from "./a"\nimport * as ns from "./b"\nimport type { T } from "./c"',
    )
    expect(info.bindings).toEqual([
      { local: "d", from: "./a", imported: "default" },
      { local: "x", from: "./a", imported: "x" },
      { local: "z", from: "./a", imported: "y" },
      { local: "ns", from: "./b", imported: "*" },
      { local: "T", from: "./c", imported: "T" },
    ])
    expect(info.declText.get("z")).toBe('import y from "./a"')
    expect(info.refs.get("z")).toEqual(new Set())
  })

  it("records `import x = require()` as a namespace binding", () => {
    const info = analyze('import fs = require("./fs")')
    expect(info.bindings).toEqual([{ local: "fs", from: "./fs", imported: "*" }])
    expect(info.declText.get("fs")).toBe('import = require "./fs"')
    expect(info.refs.get("fs")).toEqual(new Set())
    expect(info.opaque).toBe(false)
  })

  it("treats `import x = require(<non-literal>)` as opaque", () => {
    expect(analyze("import fs = require(name)").opaque).toBe(true)
  })

  it("records an entity alias as an ordinary declaration", () => {
    const info = analyze("namespace B { export const C = 1 }\nimport A = B.C")
    expect(info.declText.has("A")).toBe(true)
    expect(info.bindings).toEqual([])
  })

  it("records side-effect, dynamic and require loads by literal specifier", () => {
    const info = analyze(
      [
        'import "./polyfill"',
        'void import("./lazy")',
        'void require("./cjs")',
        "void import(`./tpl`)",
      ].join("\n"),
    )
    expect(info.bareImports).toEqual(["./polyfill", "./lazy", "./cjs", "./tpl"])
    expect(info.opaque).toBe(false)
  })

  it("flags non-literal loads, in function bodies too, as opaque", () => {
    expect(analyze("function f(n: string) { return import(n) }").opaque).toBe(true)
    expect(analyze("function f(n: string) { return require(n) }").opaque).toBe(true)
    expect(analyze("void import(`./${name}`)").opaque).toBe(true)
  })

  it("ignores a `require` call with no argument and other calls named like it", () => {
    const info = analyze("require()\nother('./x')\nobj.require('./y')")
    expect(info.opaque).toBe(false)
    expect(info.bareImports).toEqual([])
  })
})

describe("analyzeModule: effects", () => {
  it("records top-level statements as effects with their references", () => {
    const info = analyze("register(thing)\nif (flag) { go() }")
    expect(info.effects).toHaveLength(2)
    expect(info.effects[0]?.refs).toEqual(new Set(["register", "thing"]))
  })

  it("treats an unexported call-initialised binding as an effect, an exported one as a declaration", () => {
    expect(analyze("const x = make()").effects).toHaveLength(1)
    expect(analyze("export const x = make()").effects).toHaveLength(0)
    expect(analyze("const x = 1").effects).toHaveLength(0)
    expect(analyze("const x = () => make()").effects).toHaveLength(0)
    expect(analyze("const x = new Thing()").effects).toHaveLength(1)
    expect(analyze("const x = tag`a`").effects).toHaveLength(1)
    expect(analyze("const x = await later").effects).toHaveLength(1)
  })

  it("treats a class that runs code while being defined as an effect", () => {
    expect(analyze("class K { static x = make() }").effects).toHaveLength(1)
    expect(analyze("class K { static { setup() } }").effects).toHaveLength(1)
    expect(analyze("class K { method() { make() } }").effects).toHaveLength(0)
  })

  it("treats a module augmentation as an effect but a namespace as a declaration", () => {
    const augmentation = analyze('declare module "x" { interface Y {} }')
    expect(augmentation.effects).toHaveLength(1)
    expect(augmentation.declText.has("x")).toBe(true)
    expect(analyze("namespace N {}").effects).toHaveLength(0)
  })

  it("treats an anonymous non-default declaration as an effect", () => {
    expect(analyze("export {}").effects).toHaveLength(0)
  })
})

describe("analyzeModule: normalisation", () => {
  it("ignores whitespace, line breaks and comments but not code", () => {
    const a = analyze("export function f() { return 1 }")
    const b = analyze("// c\nexport  function f ( ) {\n  /* x */ return 1\n}")
    const c = analyze("export function f() { return 2 }")
    expect(b.declText.get("f")).toBe(a.declText.get("f"))
    expect(c.declText.get("f")).not.toBe(a.declText.get("f"))
  })

  it("ignores JSDoc blocks", () => {
    const a = analyze("export function f() { return 1 }")
    const b = analyze("/**\n * Docs.\n * @returns one\n */\nexport function f() { return 1 }")
    expect(b.declText.get("f")).toBe(a.declText.get("f"))
  })

  it("accumulates the text and references of a name declared twice", () => {
    const info = analyze("interface I { a: A }\ninterface I { b: B }")
    expect(info.declText.get("I")).toContain("a")
    expect(info.declText.get("I")).toContain("b")
    expect(info.refs.get("I")).toEqual(new Set(["I", "a", "A", "b", "B"]))
  })

  it("reports a module that does not parse", () => {
    const info = analyze("export function (")
    expect(info.parseError).toBe(true)
    expect(info.exports.size).toBe(0)
  })

  it("chooses the script kind from the path", () => {
    expect(analyze("export const el = <div />", "m.tsx").parseError).toBe(false)
    expect(analyze("export const el = <div />", "m.ts").parseError).toBe(true)
  })
})

describe("analyzeModule: exact output", () => {
  it("prints a declaration as its tokens joined by single spaces, one declaration per line", () => {
    expect(analyze("export const a = 1").declText.get("a")).toBe("a = 1\n")
    expect(
      analyze(
        "function f(a: string): void\nfunction f(a: number): void\nfunction f(a: any) {}",
      ).declText.get("f"),
    ).toBe(
      "function f ( a : string ) : void\nfunction f ( a : number ) : void\nfunction f ( a : any ) {  }\n",
    )
  })

  it("starts a name's text empty rather than with anything made up", () => {
    expect(analyze("let x").declText.get("x")).toBe("x\n")
    expect(analyze("let x = 1, y = 2").declText.get("y")).toBe("y = 2\n")
  })

  it("prints a declaration with a body, comments removed, as the same text", () => {
    const text = analyze("export function g() {\n  // note\n  return 1 /* x */\n}").declText.get(
      "g",
    )
    expect(text).toBe("export function g (  ) { return 1 }\n")
  })

  it("tells `export default x` from `export = x`", () => {
    const def = analyze("const x = 1\nexport default x")
    expect([...def.exports.keys()]).toEqual(["default"])
    expect(def.declText.has("default")).toBe(true)
    expect(def.declText.has("export=")).toBe(false)
    const equals = analyze("const x = 1\nexport = x")
    expect([...equals.exports.keys()].sort()).toEqual(["default", "export="])
    expect(equals.declText.has("export=")).toBe(true)
    expect(equals.declText.has("default")).toBe(false)
  })

  it("treats a statement that is not a declaration as an effect, not as an export", () => {
    const info = analyze("if (a) b()\nfoo()\nexport const x = 1")
    expect(info.effects).toHaveLength(2)
    expect([...info.exports.keys()]).toEqual(["x"])
    expect(info.declText.has("default")).toBe(false)
  })

  it("does not take a variable without an initializer for an effect", () => {
    expect(analyze("let x\nvar y").effects).toEqual([])
    expect(analyze("let x, y = make()").effects).toHaveLength(1)
  })

  it("reads `export *` and `export * as ns`, and an export list without a source", () => {
    const info = analyze(
      'export * from "./a"\nexport * as ns from "./b"\nconst c = 1\nexport { c }\nexport { d as e } from "./d"',
    )
    expect(info.stars).toEqual(["./a"])
    expect(info.exports.get("ns")).toEqual({ kind: "reexport", from: "./b", name: "*" })
    expect(info.exports.get("c")).toEqual({ kind: "local", local: "c" })
    expect(info.exports.get("e")).toEqual({ kind: "reexport", from: "./d", name: "d" })
  })

  it("reads only the first argument of a dynamic import or require as the module", () => {
    const info = analyze('import("./a", { with: { type: "json" } })\nrequire("./b", extra)')
    expect(info.bareImports).toEqual(["./a", "./b"])
    expect(info.opaque).toBe(false)
  })

  it("reads a template literal without substitutions as a module name, but not one with", () => {
    expect(analyze("import(`./a`)").bareImports).toEqual(["./a"])
    expect(analyze("import(`./${x}`)").opaque).toBe(true)
    expect(analyze("require(name)").opaque).toBe(true)
  })

  it("keeps working when the compiler leaves out the internal parse diagnostics", () => {
    const without: typeof ts = {
      ...ts,
      createSourceFile: (...args: Parameters<typeof ts.createSourceFile>) => {
        const file = createSourceFile(...args)
        Object.defineProperty(file, "parseDiagnostics", { value: undefined })
        return file
      },
    }
    const info = analyzeModule(without, "m.ts", "export const a = 1")
    expect(info.parseError).toBe(false)
    expect(info.exports.has("a")).toBe(true)
  })

  it("treats an anonymous default declaration as the name default", () => {
    expect(analyze("export default function () {}").exports.get("default")).toEqual({
      kind: "local",
      local: "default",
    })
    expect(analyze("export default class {}").exports.get("default")).toEqual({
      kind: "local",
      local: "default",
    })
  })
})

describe("analyzeModule: exportedAs", () => {
  it("lists, for each local name, every name it is exported as, in order", () => {
    const info = analyze(
      "const a = 1\nconst b = 2\nexport { a, a as first, b as second }\nexport default a",
    )
    expect(info.exportedAs).toEqual(
      new Map([
        ["a", ["a", "first"]],
        ["b", ["second"]],
        ["default", ["default"]],
      ]),
    )
  })

  it("leaves out re-exports, which name nothing local", () => {
    const info = analyze('export { x } from "./x"\nexport * as ns from "./y"\nexport const own = 1')
    expect(info.exportedAs).toEqual(new Map([["own", ["own"]]]))
    expect(info.exports.size).toBe(3)
  })

  it("is empty for a module with no exports", () => {
    expect(analyze("const a = 1").exportedAs).toEqual(new Map())
  })
})
