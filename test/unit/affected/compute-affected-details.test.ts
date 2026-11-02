import ts from "typescript"
import { describe, expect, it } from "vitest"
import { computeAffected } from "../../../src/affected/index.js"
import { exportKey, sourceKey, testKey } from "../../../src/affected/keys.js"
import { affected } from "./support.js"
import type { Project } from "./support.js"

describe("computeAffected: JavaScript and directories", () => {
  it("follows imports between JavaScript modules", () => {
    const before: Project = {
      "src/a.js": "export const a = 1\n",
      "src/b.mjs": 'import { a } from "./a.js"\nexport const b = a\n',
      "test/b.test.js": 'import { b } from "../src/b.mjs"\nb\n',
      "test/other.test.js": "export {}\n",
    }
    const result = affected(before, { ...before, "src/a.js": "export const a = 2\n" })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/b.test.js"])
  })

  it("resolves an import of a directory to its index file, at any depth", () => {
    const before: Project = {
      "index.ts": "export const root = 1\n",
      "main.ts": 'import { root } from "."\nexport const m = root\n',
      "src/util/index.ts": "export const u = 1\n",
      "src/main.ts": 'import { u } from "./util"\nexport const s = u\n',
      "a/b/c/index.ts": "export const deep = 1\n",
      "a/main.ts": 'import { deep } from "./b/c"\nexport const d = deep\n',
      "test/all.test.ts":
        'import { m } from "../main.js"\nimport { s } from "../src/main.js"\nimport { d } from "../a/main.js"\n[m, s, d]\n',
    }
    for (const [path, name] of [
      ["index.ts", "root"],
      ["src/util/index.ts", "u"],
      ["a/b/c/index.ts", "deep"],
    ] as const) {
      const result = affected(before, { ...before, [path]: `export const ${name} = 2\n` })
      expect(result.affectedTests).toEqual(["test/all.test.ts"])
    }
  })
})

describe("computeAffected: which cause is kept", () => {
  const before: Project = {
    "src/a.ts": "export const x = 1\n",
    "src/b.ts": 'import { x } from "./a.js"\nexport const y = x\n',
    "src/o.ts": 'export const o1 = 1\nconst name = "./z"\nimport(name)\n',
    "test/t.test.ts": 'import { y } from "../src/b.js"\nimport { o1 } from "../src/o.js"\ny\no1\n',
  }

  it("keeps the explanation that comes from the change itself when a dynamic load reaches the test as quickly", () => {
    const result = affected(before, { ...before, "src/a.ts": "export const x = 2\n" })
    expect(result.affectedTests).toEqual(["test/t.test.ts"])
    expect(result.causes.get(testKey("test/t.test.ts"))).toBe(exportKey("src/b.ts", "y"))
  })

  it("explains a source by what it depends on", () => {
    const result = affected(before, { ...before, "src/a.ts": "export const x = 2\n" })
    expect(result.causes.get(sourceKey("src/b.ts"))).toBe(exportKey("src/a.ts", "x"))
    expect(result.causes.get(sourceKey("src/a.ts"))).toBe("changed:src/a.ts")
  })
})

describe("computeAffected: dynamic loads and link rules", () => {
  it("runs a test that loads code dynamically when only a linked non-module file changed", () => {
    const before: Project = {
      "fixtures/data.json": "{}\n",
      "test/linked.test.ts": "export {}\n",
      "test/dynamic.test.ts": 'const name = "./x"\nimport(name)\n',
      "test/plain.test.ts": "export {}\n",
    }
    const result = affected(
      before,
      { ...before, "fixtures/data.json": '{"a":1}\n' },
      {
        links: [{ when: "fixtures/**", run: ["test/linked.test.ts"] }],
      },
    )
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/dynamic.test.ts", "test/linked.test.ts"])
  })

  it("runs only the tests of the link rule that matches", () => {
    const before: Project = {
      "fx/data.json": "{}\n",
      "other/data.json": "{}\n",
      "test/one.test.ts": "export {}\n",
      "test/two.test.ts": "export {}\n",
    }
    const options = {
      links: [
        { when: "fx/**", run: ["test/one.test.ts"] },
        { when: "other/**", run: ["test/two.test.ts"] },
      ],
    }
    expect(affected(before, { ...before, "fx/data.json": "1\n" }, options).affectedTests).toEqual([
      "test/one.test.ts",
    ])
    expect(
      affected(before, { ...before, "other/data.json": "1\n" }, options).affectedTests,
    ).toEqual(["test/two.test.ts"])
  })

  it("still goes full for an unplaced file when a link rule exists that does not cover it", () => {
    const before: Project = { "weird.xyz": "a\n", "test/a.test.ts": "export {}\n" }
    const result = affected(
      before,
      { ...before, "weird.xyz": "b\n" },
      {
        links: [{ when: "fixtures/**", run: ["test/**"] }],
      },
    )
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toEqual({ reason: "unplaced-file", file: "weird.xyz", to: "full" })
  })

  it("counts a rename as linked when either end is covered by a rule", () => {
    const files = new Map([["test/a.test.ts", "export {}\n"]])
    const result = computeAffected({
      ts,
      files,
      baseFiles: new Map(),
      changed: [{ path: "docs/new.md", kind: "renamed", renamedFrom: "fixtures/old.md" }],
      options: { links: [{ when: "fixtures/**", run: ["test/a.test.ts"] }] },
    })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/a.test.ts"])
  })
})

describe("computeAffected: parse errors say where", () => {
  it("names a current module that does not parse", () => {
    const before: Project = { "src/a.ts": "export const a = 1\n", "test/a.test.ts": "export {}\n" }
    const result = affected(before, { ...before, "src/a.ts": "export const a = \n" })
    expect(result.fullBecause).toEqual({ reason: "parse-error", file: "src/a.ts", to: "full" })
  })

  it("names a base module that did not parse", () => {
    const before: Project = { "src/old.ts": "export const = 1\n", "test/a.test.ts": "export {}\n" }
    const result = affected(before, { ...before, "src/old.ts": "export const a = 1\n" })
    expect(result.fullBecause).toEqual({ reason: "parse-error", file: "src/old.ts", to: "full" })
  })
})

describe("computeAffected: how a change spreads", () => {
  it("follows a side-effect import to everything the importing module exports", () => {
    const before: Project = {
      "src/a.ts": "export const a = 1\n",
      "src/side.ts": 'import "./a.js"\nexport const s = 1\n',
      "src/up.ts": 'import { s } from "./side.js"\nexport const u = s\n',
      "test/t.test.ts": 'import { u } from "../src/up.js"\nu\n',
      "test/other.test.ts": "export {}\n",
    }
    const result = affected(before, { ...before, "src/a.ts": "export const a = 2\n" })
    expect(result.affectedTests).toEqual(["test/t.test.ts"])
    expect(result.mutateTargets).toEqual(["src/a.ts", "src/side.ts"])
  })

  it("keeps the namespace importers of two changed modules apart", () => {
    const before: Project = {
      "src/a1.ts": "export const v = 1\n",
      "src/a2.ts": "export const w = 1\n",
      "test/t1.test.ts": 'import * as A from "../src/a1.js"\nA\n',
      "test/t2.test.ts": 'import * as B from "../src/a2.js"\nB\n',
      "test/t3.test.ts": "export {}\n",
    }
    const result = affected(before, {
      ...before,
      "src/a1.ts": "export const v = 2\n",
      "src/a2.ts": "export const w = 2\n",
    })
    expect(result.affectedTests).toEqual(["test/t1.test.ts", "test/t2.test.ts"])
  })

  it("treats a top-level statement that mentions a changed name as changing the whole module", () => {
    const before: Project = {
      "src/m.ts": "const key = 1\nregister(key)\nconst unrelated = 1\nexport const other = 2\n",
      "test/t.test.ts": 'import { other } from "../src/m.js"\nother\n',
    }
    expect(
      affected(before, { ...before, "src/m.ts": before["src/m.ts"]!.replace("key = 1", "key = 2") })
        .affectedTests,
    ).toEqual(["test/t.test.ts"])
    const untouched = affected(before, {
      ...before,
      "src/m.ts": before["src/m.ts"]!.replace("unrelated = 1", "unrelated = 2"),
    })
    expect(untouched.affectedTests).toEqual([])
  })

  it("does not pass a changed default export through `export *`", () => {
    const before: Project = {
      "src/s.ts": "export default function f() { return 1 }\nexport const n = 1\n",
      "src/barrel.ts": 'export * from "./s.js"\n',
      "test/named.test.ts": 'import { n } from "../src/barrel.js"\nn\n',
      "test/ns.test.ts": 'import * as ns from "../src/barrel.js"\nns\n',
    }
    const result = affected(before, {
      ...before,
      "src/s.ts": before["src/s.ts"]!.replace("return 1", "return 2"),
    })
    expect(result.affectedSources).toEqual(["src/s.ts"])
    expect(result.affectedTests).toEqual([])
  })

  it("passes a changed named export through `export *`", () => {
    const before: Project = {
      "src/s.ts": "export default function f() { return 1 }\nexport const n = 1\n",
      "src/barrel.ts": 'export * from "./s.js"\n',
      "test/named.test.ts": 'import { n } from "../src/barrel.js"\nn\n',
    }
    const result = affected(before, {
      ...before,
      "src/s.ts": before["src/s.ts"]!.replace("n = 1", "n = 2"),
    })
    expect(result.affectedTests).toEqual(["test/named.test.ts"])
  })

  it("lists as mutation targets the changed modules and their direct dependents only", () => {
    const before: Project = {
      "src/a.ts": "export const a = 1\n",
      "src/b.ts": 'import { a } from "./a.js"\nexport const b = a\n',
      "src/c.ts": 'import { b } from "./b.js"\nexport const c = b\n',
      "test/c.test.ts": 'import { c } from "../src/c.js"\nc\n',
    }
    const result = affected(before, { ...before, "src/a.ts": "export const a = 2\n" })
    expect(result.mutateTargets).toEqual(["src/a.ts", "src/b.ts"])
    expect(result.affectedSources).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"])
  })

  it("copes with a module that was deleted although it had top-level statements and exports", () => {
    const before: Project = {
      "src/gone.ts": "register()\nexport const g = 1\n",
      "test/t.test.ts": 'import { g } from "../src/gone.js"\ng\n',
    }
    const after = Object.fromEntries(
      Object.entries(before).filter(([path]) => path !== "src/gone.ts"),
    )
    const result = affected(before, after)
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/t.test.ts"])
    expect(result.widened).toEqual([
      {
        reason: "module-side-effect",
        file: "src/gone.ts",
        to: "all-exports",
        detail: "top-level statement changed",
      },
    ])
  })

  it("notices a top-level statement whose text changed though their number did not", () => {
    const before: Project = {
      "src/e.ts": "register(1)\nexport const v = 1\n",
      "test/t.test.ts": "export {}\n",
    }
    const result = affected(before, { ...before, "src/e.ts": "register(2)\nexport const v = 1\n" })
    expect(result.widened).toEqual([
      {
        reason: "module-side-effect",
        file: "src/e.ts",
        to: "all-exports",
        detail: "top-level statement changed",
      },
    ])
  })

  it("notices top-level statements that were reordered", () => {
    const before: Project = {
      "src/e.ts": "first()\nsecond()\nexport const v = 1\n",
      "test/t.test.ts": "export {}\n",
    }
    const result = affected(before, {
      ...before,
      "src/e.ts": "second()\nfirst()\nexport const v = 1\n",
    })
    expect(result.widened).toHaveLength(1)
    const imports = {
      "src/e.ts": 'import "./x.js"\nimport "./y.js"\nexport const v = 1\n',
      "src/x.ts": "export {}\n",
      "src/y.ts": "export {}\n",
    }
    const swapped = affected(imports, {
      ...imports,
      "src/e.ts": 'import "./y.js"\nimport "./x.js"\nexport const v = 1\n',
    })
    expect(swapped.widened[0]?.detail).toBe("bare import or export * changed")
  })

  it("does not take imports that concatenate alike for the same imports", () => {
    const files = {
      "src/ab.ts": "export {}\n",
      "src/c.ts": "export {}\n",
      "src/a.ts": "export {}\n",
      "src/bc.ts": "export {}\n",
    }
    const before: Project = { ...files, "src/e.ts": 'import "./ab.js"\nimport "./c.js"\n' }
    const result = affected(before, {
      ...before,
      "src/e.ts": 'import "./a.js"\nimport "./bc.js"\n',
    })
    expect(result.widened[0]?.detail).toBe("bare import or export * changed")
  })
})

describe("computeAffected: distances", () => {
  it("counts a re-export as one boundary, so only its direct neighbours are mutation targets", () => {
    const before: Project = {
      "src/a.ts": "export const a = 1\n",
      "src/b.ts": 'export { a } from "./a.js"\n',
      "src/c.ts": 'import { a } from "./b.js"\nexport const c = a\n',
      "src/d.ts": 'import { c } from "./c.js"\nexport const d = c\n',
      "test/d.test.ts": 'import { d } from "../src/d.js"\nd\n',
    }
    const result = affected(before, { ...before, "src/a.ts": "export const a = 2\n" })
    expect(result.affectedTests).toEqual(["test/d.test.ts"])
    expect(result.mutateTargets).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("counts a side-effect import as one boundary, so only its direct neighbours are mutation targets", () => {
    const before: Project = {
      "src/a.ts": "export const a = 1\n",
      "src/side.ts": 'import "./a.js"\nexport const s = 1\n',
      "src/up.ts": 'import { s } from "./side.js"\nexport const u = s\n',
      "src/up2.ts": 'import { u } from "./up.js"\nexport const u2 = u\n',
      "test/t.test.ts": 'import { u2 } from "../src/up2.js"\nu2\n',
    }
    const result = affected(before, { ...before, "src/a.ts": "export const a = 2\n" })
    expect(result.affectedTests).toEqual(["test/t.test.ts"])
    expect(result.mutateTargets).toEqual(["src/a.ts", "src/side.ts"])
  })

  it("uses the nearest distance when a module is reached by a long route first and a short one later", () => {
    const before: Project = {
      "src/m.ts": "const h1 = 1\nconst h2 = h1\nexport const e = 1\nexport const g = h2\n",
      "src/x.ts": 'export { e } from "./m.js"\n',
      "src/f.ts":
        'import { e } from "./x.js"\nimport { g } from "./m.js"\nexport const f = [e, g]\n',
      "test/f.test.ts": 'import { f } from "../src/f.js"\nf\n',
    }
    const after = {
      ...before,
      "src/m.ts": before["src/m.ts"]!.replace("h1 = 1", "h1 = 2").replace("e = 1", "e = 2"),
    }
    const result = affected(before, after)
    expect(result.mutateTargets).toEqual(["src/f.ts", "src/m.ts", "src/x.ts"])
  })
})

describe("computeAffected: an ignored file changes next to a dynamic load", () => {
  it("runs nothing when the only change is an ignored file, even if a test loads code dynamically", () => {
    const before: Project = {
      "README.md": "a\n",
      "test/dynamic.test.ts": 'const name = "./x"\nimport(name)\n',
    }
    const result = affected(before, { ...before, "README.md": "b\n" }, { ignore: ["README.md"] })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual([])
    expect(result.widened).toEqual([])
  })
})

describe("computeAffected: import lists that concatenate alike", () => {
  it("tells ['x', 'yz'] from ['xy', 'z']", () => {
    const before: Project = {
      "src/e.ts": 'import "x"\nimport "yz"\n',
      "test/t.test.ts": "export {}\n",
    }
    const result = affected(before, { ...before, "src/e.ts": 'import "xy"\nimport "z"\n' })
    expect(result.widened[0]?.detail).toBe("bare import or export * changed")
  })
})
