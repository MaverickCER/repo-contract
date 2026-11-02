import { describe, expect, it } from "vitest"
import { explainAffected } from "../../../src/affected/index.js"
import { affected } from "./support.js"
import type { Project } from "./support.js"

const base: Project = {
  "src/a.ts": `export function foo() { return 1 }\nexport function other() { return 2 }\n`,
  "src/b.ts": `import { foo } from "./a.js"\nexport function bar() { return foo() + 1 }\nexport function standalone() { return 0 }\n`,
  "src/c.ts": `import { standalone } from "./b.js"\nexport const baz = standalone()\n`,
  "test/a.test.ts": `import { foo } from "../src/a.js"\nfoo()\n`,
  "test/b.test.ts": `import { bar } from "../src/b.js"\nbar()\n`,
  "test/c.test.ts": `import { baz } from "../src/c.js"\nbaz\n`,
  "test/other.test.ts": `import { other } from "../src/a.js"\nother()\n`,
}

const edit = (changes: Project): Project => ({ ...base, ...changes })

describe("computeAffected: symbol-level narrowing", () => {
  it("follows a changed export to the tests that reach it and no further", () => {
    const result = affected(
      base,
      edit({ "src/a.ts": base["src/a.ts"]!.replace("return 1", "return 10") }),
    )
    expect(result.scope).toBe("affected")
    expect(result.changedSymbols).toEqual(["src/a.ts#foo", "src/b.ts#bar"])
    expect(result.affectedTests).toEqual(["test/a.test.ts", "test/b.test.ts"])
    expect(result.affectedSources).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("does not affect a sibling export's dependents", () => {
    const result = affected(
      base,
      edit({ "src/a.ts": base["src/a.ts"]!.replace("return 2", "return 20") }),
    )
    expect(result.affectedTests).toEqual(["test/other.test.ts"])
  })

  it("maps a changed private helper onto only the exports that reach it", () => {
    const before: Project = {
      "src/m.ts": `function helper() { return 1 }\nexport function usesHelper() { return helper() }\nexport function independent() { return 2 }\n`,
      "test/uses.test.ts": `import { usesHelper } from "../src/m.js"\nusesHelper()\n`,
      "test/independent.test.ts": `import { independent } from "../src/m.js"\nindependent()\n`,
    }
    const after = { ...before, "src/m.ts": before["src/m.ts"]!.replace("return 1", "return 100") }
    const result = affected(before, after)
    expect(result.changedSymbols).toEqual(["src/m.ts#usesHelper"])
    expect(result.affectedTests).toEqual(["test/uses.test.ts"])
  })

  it("follows transitive private helpers", () => {
    const before: Project = {
      "src/m.ts": `function leaf() { return 1 }\nfunction mid() { return leaf() }\nexport function top() { return mid() }\n`,
      "test/top.test.ts": `import { top } from "../src/m.js"\ntop()\n`,
    }
    const after = { ...before, "src/m.ts": before["src/m.ts"]!.replace("return 1", "return 2") }
    expect(affected(before, after).changedSymbols).toEqual(["src/m.ts#top"])
  })

  it("ignores formatting and comment-only edits", () => {
    const result = affected(
      base,
      edit({
        "src/a.ts": `// note\nexport function foo() {\n  return 1\n}\nexport function other() { return 2 }\n`,
      }),
    )
    expect(result.changedSymbols).toEqual([])
    expect(result.affectedTests).toEqual([])
  })

  it("treats a changed test file as affected by itself", () => {
    const result = affected(
      base,
      edit({ "test/c.test.ts": `import { baz } from "../src/c.js"\nbaz; baz\n` }),
    )
    expect(result.affectedTests).toEqual(["test/c.test.ts"])
  })

  it("reports nothing for an empty diff", () => {
    const result = affected(base, base)
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual([])
    expect(result.mutateTargets).toEqual([])
  })
})

describe("computeAffected: import forms", () => {
  const lib = {
    "src/lib.ts": `export const x = 1\nexport const y = 2\nexport default function main() { return 0 }\n`,
  }

  it("follows default imports", () => {
    const before = { ...lib, "t/d.test.ts": `import main from "../src/lib.js"\nmain()\n` }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("return 0", "return 1") }
    expect(affected(before, after).affectedTests).toEqual(["t/d.test.ts"])
  })

  it("treats a namespace import as depending on every export", () => {
    const before = { ...lib, "t/n.test.ts": `import * as lib from "../src/lib.js"\nlib.x\n` }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("y = 2", "y = 3") }
    expect(affected(before, after).affectedTests).toEqual(["t/n.test.ts"])
  })

  it("follows aliased imports", () => {
    const before = {
      ...lib,
      "t/a.test.ts": `import { x as renamed } from "../src/lib.js"\nrenamed\n`,
    }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("x = 1", "x = 9") }
    expect(affected(before, after).affectedTests).toEqual(["t/a.test.ts"])
    expect(
      affected(before, { ...before, "src/lib.ts": lib["src/lib.ts"].replace("y = 2", "y = 9") })
        .affectedTests,
    ).toEqual([])
  })

  it("follows named re-exports through a barrel", () => {
    const before = {
      ...lib,
      "src/index.ts": `export { x } from "./lib.js"\nexport { y as why } from "./lib.js"\n`,
      "t/x.test.ts": `import { x } from "../src/index.js"\nx\n`,
      "t/y.test.ts": `import { why } from "../src/index.js"\nwhy\n`,
    }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("y = 2", "y = 3") }
    const result = affected(before, after)
    expect(result.affectedTests).toEqual(["t/y.test.ts"])
    expect(result.changedSymbols).toContain("src/index.ts#why")
  })

  it("follows export * but never forwards default", () => {
    const before = {
      ...lib,
      "src/index.ts": `export * from "./lib.js"\n`,
      "t/x.test.ts": `import { x } from "../src/index.js"\nx\n`,
      "t/d.test.ts": `import main from "../src/index.js"\nmain\n`,
    }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("x = 1", "x = 5") }
    expect(affected(before, after).affectedTests).toEqual(["t/x.test.ts"])
  })

  it("follows export * as namespace re-exports", () => {
    const before = {
      ...lib,
      "src/index.ts": `export * as lib from "./lib.js"\n`,
      "t/l.test.ts": `import { lib } from "../src/index.js"\nlib\n`,
    }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("x = 1", "x = 5") }
    expect(affected(before, after).affectedTests).toEqual(["t/l.test.ts"])
  })

  it("follows a local export list", () => {
    const before = {
      "src/m.ts": `const secret = 1\nexport { secret as visible }\n`,
      "t/m.test.ts": `import { visible } from "../src/m.js"\nvisible\n`,
    }
    const after = { ...before, "src/m.ts": before["src/m.ts"].replace("= 1", "= 2") }
    expect(affected(before, after).changedSymbols).toEqual(["src/m.ts#visible"])
  })

  it("resolves .js specifiers to .ts sources and index files", () => {
    const before = {
      "src/dir/index.ts": `export const v = 1\n`,
      "t/i.test.ts": `import { v } from "../src/dir/index.js"\nv\n`,
    }
    const after = { ...before, "src/dir/index.ts": `export const v = 2\n` }
    expect(affected(before, after).affectedTests).toEqual(["t/i.test.ts"])
  })

  it("does not follow bare package imports", () => {
    const before = {
      "src/m.ts": `import { z } from "zod"\nexport const s = z\n`,
      "t/m.test.ts": `import { s } from "../src/m.js"\ns\n`,
    }
    const after = {
      ...before,
      "src/m.ts": `import { z } from "zod"\nexport const s = z\nexport const extra = 1\n`,
    }
    expect(affected(before, after).changedSymbols).toEqual(["src/m.ts#extra"])
  })

  it("follows a literal dynamic import as a dependency on every export", () => {
    const before = {
      ...lib,
      "t/dyn.test.ts": `test("x", async () => { await import("../src/lib.js") })\n`,
    }
    const after = { ...before, "src/lib.ts": lib["src/lib.ts"].replace("y = 2", "y = 3") }
    expect(affected(before, after).affectedTests).toEqual(["t/dyn.test.ts"])
  })

  it("follows a bare side-effect import", () => {
    const before = {
      "src/polyfill.ts": `globalThis.flag = 1\n`,
      "t/p.test.ts": `import "../src/polyfill.js"\n`,
    }
    const after = { ...before, "src/polyfill.ts": `globalThis.flag = 2\n` }
    expect(affected(before, after).affectedTests).toEqual(["t/p.test.ts"])
  })
})

describe("computeAffected: module side effects", () => {
  it("treats a changed top-level statement as affecting every export", () => {
    const before = {
      "src/m.ts": `register("a")\nexport const one = 1\nexport const two = 2\n`,
      "t/one.test.ts": `import { one } from "../src/m.js"\none\n`,
      "t/two.test.ts": `import { two } from "../src/m.js"\ntwo\n`,
    }
    const after = { ...before, "src/m.ts": before["src/m.ts"].replace('"a"', '"b"') }
    const result = affected(before, after)
    expect(result.affectedTests).toEqual(["t/one.test.ts", "t/two.test.ts"])
    expect(result.widened.map((w) => w.reason)).toContain("module-side-effect")
  })

  it("treats a private call-initialised binding as an effect", () => {
    const before = {
      "src/m.ts": `const handle = register("a")\nexport const one = 1\n`,
      "t/one.test.ts": `import { one } from "../src/m.js"\none\n`,
    }
    const after = { ...before, "src/m.ts": before["src/m.ts"].replace('"a"', '"b"') }
    expect(affected(before, after).affectedTests).toEqual(["t/one.test.ts"])
  })

  it("propagates a changed import binding into the exports that use it", () => {
    const before = {
      "src/dep.ts": `export const d = 1\n`,
      "src/m.ts": `import { d } from "./dep.js"\nexport const usesD = d\nexport const free = 0\n`,
      "t/uses.test.ts": `import { usesD } from "../src/m.js"\nusesD\n`,
      "t/free.test.ts": `import { free } from "../src/m.js"\nfree\n`,
    }
    const after = { ...before, "src/dep.ts": `export const d = 2\n` }
    expect(affected(before, after).affectedTests).toEqual(["t/uses.test.ts"])
  })
})

describe("computeAffected: adds, deletes and renames", () => {
  it("affects the importers of a deleted module", () => {
    const before = {
      "src/gone.ts": `export const g = 1\n`,
      "t/g.test.ts": `import { g } from "../src/gone.js"\ng\n`,
    }
    const result = affected(before, { "t/g.test.ts": before["t/g.test.ts"] })
    expect(result.affectedTests).toEqual(["t/g.test.ts"])
  })

  it("affects the importers of a removed export", () => {
    const before = {
      "src/m.ts": `export const a = 1\nexport const b = 2\n`,
      "t/b.test.ts": `import { b } from "../src/m.js"\nb\n`,
    }
    const result = affected(before, { ...before, "src/m.ts": `export const a = 1\n` })
    expect(result.affectedTests).toEqual(["t/b.test.ts"])
  })

  it("ignores a brand-new module nobody imports yet", () => {
    const result = affected(base, edit({ "src/new.ts": `export const n = 1\n` }))
    expect(result.affectedTests).toEqual([])
    expect(result.mutateTargets).toEqual(["src/new.ts"])
  })

  it("handles a rename as delete plus add", () => {
    const before = {
      "src/old.ts": `export const v = 1\n`,
      "t/v.test.ts": `import { v } from "../src/old.js"\nv\n`,
    }
    const result = affected(before, {
      "src/new.ts": before["src/old.ts"],
      "t/v.test.ts": `import { v } from "../src/new.js"\nv\n`,
    })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["t/v.test.ts"])
  })
})

describe("computeAffected: widening to full", () => {
  it.each([
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vitest.config.ts",
    ".github/workflows/ci.yml",
    ".repo-contract/exceptions/x.json",
  ])("goes full on a change to %s", (path) => {
    const result = affected({ ...base, [path]: "a" }, { ...base, [path]: "b" })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({ reason: "global-trigger", file: path })
    expect(result.affectedTests).toEqual(
      Object.keys(base)
        .filter((p) => p.endsWith(".test.ts"))
        .sort(),
    )
  })

  it("goes full on a changed file the graph cannot place", () => {
    const result = affected(
      { ...base, "data/fixture.json": "{}" },
      { ...base, "data/fixture.json": "[]" },
    )
    expect(result.fullBecause).toMatchObject({ reason: "unplaced-file", file: "data/fixture.json" })
  })

  it("does not go full for ignored files", () => {
    const result = affected(
      { ...base, ".changeset/a.md": "x" },
      { ...base, ".changeset/a.md": "y" },
    )
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual([])
  })

  it("honors custom ignore globs", () => {
    const result = affected(
      { ...base, "docs/a.md": "x" },
      { ...base, "docs/a.md": "y" },
      { ignore: ["docs/**"] },
    )
    expect(result.scope).toBe("affected")
  })

  it("honors custom trigger globs", () => {
    const result = affected(base, edit({ "src/a.ts": "export const q = 1\n" }), {
      triggers: ["src/a.ts"],
    })
    expect(result.scope).toBe("full")
  })

  it("goes full when a module does not parse", () => {
    const result = affected(base, edit({ "src/a.ts": "export function (" }))
    expect(result.fullBecause).toMatchObject({ reason: "parse-error", file: "src/a.ts" })
  })

  it("goes full when an unchanged module does not parse", () => {
    const result = affected(
      { ...base, "src/broken.ts": "export function (" },
      { ...base, "src/broken.ts": "export function (", "src/a.ts": "export const z = 1\n" },
    )
    expect(result.fullBecause).toMatchObject({ reason: "parse-error", file: "src/broken.ts" })
  })

  it("runs a test that loads modules dynamically whenever anything changed", () => {
    const withOpaque: Project = {
      ...base,
      "test/dyn.test.ts": `const name = "x"\nawait import(name)\n`,
    }
    const result = affected(withOpaque, {
      ...withOpaque,
      "src/a.ts": withOpaque["src/a.ts"]!.replace("return 1", "return 9"),
    })
    expect(result.affectedTests).toContain("test/dyn.test.ts")
    expect(result.widened).toContainEqual({
      reason: "dynamic-import",
      file: "test/dyn.test.ts",
      to: "always-run",
    })
    expect(affected(withOpaque, withOpaque).affectedTests).toEqual([])
  })

  it("treats a source that requires dynamically as affected by any change", () => {
    const before: Project = {
      ...base,
      "src/loader.ts": `export function load(name: string) { return require(name) }\n`,
      "test/loader.test.ts": `import { load } from "../src/loader.js"\nload("x")\n`,
    }
    const result = affected(before, {
      ...before,
      "src/a.ts": before["src/a.ts"]!.replace("return 1", "return 9"),
    })
    expect(result.affectedTests).toContain("test/loader.test.ts")
  })

  it("applies link rules for couplings the graph cannot see", () => {
    const before = { ...base, "test/fixtures/g.golden": "a" }
    const result = affected(
      before,
      { ...before, "test/fixtures/g.golden": "b" },
      { links: [{ when: "test/fixtures/**", run: ["test/c.test.ts"] }] },
    )
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/c.test.ts"])
  })
})

describe("computeAffected: mutation targets", () => {
  it("includes changed sources and their direct symbol dependents, not transitive ones or tests", () => {
    const result = affected(
      base,
      edit({ "src/a.ts": base["src/a.ts"]!.replace("return 1", "return 10") }),
    )
    expect(result.mutateTargets).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("excludes declaration files and tests", () => {
    const result = affected(
      base,
      edit({ "src/types.d.ts": "export type T = 1\n", "test/c.test.ts": "export {}\n" }),
    )
    expect(result.mutateTargets).toEqual([])
  })
})

describe("explainAffected", () => {
  it("walks each test back to the changed file", () => {
    const result = affected(
      base,
      edit({ "src/a.ts": base["src/a.ts"]!.replace("return 1", "return 10") }),
    )
    expect(explainAffected(result)).toEqual([
      "test/a.test.ts must run <- src/a.ts exports a changed `foo` <- `foo` in src/a.ts changed <- src/a.ts changed",
      "test/b.test.ts must run <- src/b.ts exports a changed `bar` <- src/a.ts exports a changed `foo` <- `foo` in src/a.ts changed <- src/a.ts changed",
    ])
  })

  it("names the reason when everything is affected", () => {
    const result = affected({ "package.json": "{}" }, { "package.json": '{"a":1}' })
    expect(explainAffected(result)).toEqual(["full run: global-trigger (package.json)"])
  })

  it("names the detail when the reason has one", () => {
    const result = affected(base, edit({ "src/a.ts": "export function (" }))
    expect(explainAffected(result)).toEqual(["full run: parse-error (src/a.ts)"])
  })
})
