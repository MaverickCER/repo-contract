import ts from "typescript"
import { describe, expect, it } from "vitest"
import { computeAffected, explainAffected } from "../../../src/affected/index.js"
import type { AffectedResult, ChangedFile } from "../../../src/affected/index.js"
import { affected } from "./support.js"

const run = (
  files: Record<string, string>,
  baseFiles: Record<string, string>,
  changed: ChangedFile[],
) =>
  computeAffected({
    ts,
    files: new Map(Object.entries(files)),
    baseFiles: new Map(Object.entries(baseFiles)),
    changed,
  })

describe("computeAffected: caller mistakes widen instead of guessing", () => {
  it("goes full when a changed module was not supplied", () => {
    const result = run({}, {}, [{ path: "src/a.ts", kind: "added" }])
    expect(result.fullBecause).toEqual({
      reason: "unplaced-file",
      file: "src/a.ts",
      to: "full",
      detail: "changed module was not supplied to the analysis",
    })
    expect(explainAffected(result)).toEqual([
      "full run: unplaced-file (src/a.ts: changed module was not supplied to the analysis)",
    ])
  })

  it("goes full when the base of a modified module was not supplied", () => {
    const result = run({ "src/a.ts": "export {}" }, {}, [{ path: "src/a.ts", kind: "modified" }])
    expect(result.fullBecause).toEqual({
      reason: "unplaced-file",
      file: "src/a.ts",
      to: "full",
      detail: "base content of a modified module was not supplied",
    })
  })

  it("does not need the supplied base of a deleted module's current form", () => {
    const result = run({}, { "src/a.ts": "export const a = 1\n" }, [
      { path: "src/a.ts", kind: "deleted" },
    ])
    expect(result.scope).toBe("affected")
    expect(result.changedSymbols).toEqual(["src/a.ts#a"])
  })

  it("goes full when the base of a deleted module was not supplied", () => {
    const result = run({ "t/a.test.ts": "export {}" }, {}, [{ path: "src/a.ts", kind: "deleted" }])
    expect(result.fullBecause).toEqual({
      reason: "unplaced-file",
      file: "src/a.ts",
      to: "full",
      detail: "base content of a deleted module was not supplied",
    })
  })

  it("goes full when the base of a renamed-from module was not supplied", () => {
    const result = run({ "src/new.ts": "export {}" }, {}, [
      { path: "src/new.ts", kind: "renamed", renamedFrom: "src/old.ts" },
    ])
    expect(result.fullBecause).toEqual({
      reason: "unplaced-file",
      file: "src/old.ts",
      to: "full",
      detail: "base content of a renamed module was not supplied",
    })
  })

  it("goes full when the base of a changed module does not parse", () => {
    const result = run({ "src/a.ts": "export const a = 1" }, { "src/a.ts": "export (" }, [
      { path: "src/a.ts", kind: "modified" },
    ])
    expect(result.fullBecause).toMatchObject({ reason: "parse-error", file: "src/a.ts" })
  })
})

describe("computeAffected: renames", () => {
  it("handles a renamed module", () => {
    const result = run(
      {
        "src/new.ts": "export const v = 1\n",
        "t/v.test.ts": 'import { v } from "../src/new.js"\nv\n',
      },
      { "src/old.ts": "export const v = 1\n" },
      [{ path: "src/new.ts", kind: "renamed", renamedFrom: "src/old.ts" }],
    )
    expect(result.scope).toBe("affected")
    expect(result.changedSymbols).toContain("src/old.ts#v")
    expect(result.mutateTargets).toEqual(["src/new.ts"])
  })

  it("goes full when a non-module is renamed", () => {
    const result = run({}, {}, [
      { path: "data/b.json", kind: "renamed", renamedFrom: "data/a.json" },
    ])
    expect(result.fullBecause).toEqual({ reason: "unplaced-file", file: "data/a.json", to: "full" })
  })

  it("ignores a rename between ignored files", () => {
    const result = run({}, {}, [
      { path: ".changeset/b.md", kind: "renamed", renamedFrom: ".changeset/a.md" },
    ])
    expect(result.scope).toBe("affected")
  })

  it("goes full on a rename away from a trigger", () => {
    const result = run({}, {}, [
      { path: "old-package.txt", kind: "renamed", renamedFrom: "package.json" },
    ])
    expect(result.fullBecause).toMatchObject({ reason: "global-trigger", file: "package.json" })
  })

  it("lets a link rule place a renamed non-module", () => {
    const result = computeAffected({
      ts,
      files: new Map([["t/a.test.ts", "export {}"]]),
      baseFiles: new Map(),
      changed: [{ path: "fx/b.json", kind: "renamed", renamedFrom: "fx/a.json" }],
      options: { links: [{ when: "fx/**", run: ["t/**"] }] },
    })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["t/a.test.ts"])
  })
})

describe("computeAffected: export retargeting and widening details", () => {
  const lib = (n: string) => `export const ${n} = 1\n`

  it("notices a re-export that now points somewhere else", () => {
    const before = {
      "src/a.ts": lib("x"),
      "src/b.ts": lib("x"),
      "src/index.ts": 'export { x } from "./a.js"\n',
      "t/x.test.ts": 'import { x } from "../src/index.js"\nx\n',
    }
    const after = { ...before, "src/index.ts": 'export { x } from "./b.js"\n' }
    expect(affected(before, after).affectedTests).toEqual(["t/x.test.ts"])
  })

  it("notices a re-export of a different name from the same module", () => {
    const before = {
      "src/a.ts": "export const x = 1\nexport const y = 1\n",
      "src/index.ts": 'export { x as v } from "./a.js"\n',
      "t/v.test.ts": 'import { v } from "../src/index.js"\nv\n',
    }
    const after = { ...before, "src/index.ts": 'export { y as v } from "./a.js"\n' }
    expect(affected(before, after).affectedTests).toEqual(["t/v.test.ts"])
  })

  it("notices an export that switched between local and re-exported", () => {
    const before = {
      "src/a.ts": lib("x"),
      "src/index.ts": "const x = 1\nexport { x }\n",
      "t/x.test.ts": 'import { x } from "../src/index.js"\nx\n',
    }
    const after = { ...before, "src/index.ts": 'export { x } from "./a.js"\n' }
    expect(affected(before, after).affectedTests).toEqual(["t/x.test.ts"])
  })

  it("records why a changed statement widened to every export", () => {
    const before = { "src/m.ts": 'init("a")\nexport const one = 1\n' }
    const after = { "src/m.ts": 'init("b")\nexport const one = 1\n' }
    expect(affected(before, after).widened).toEqual([
      {
        reason: "module-side-effect",
        file: "src/m.ts",
        to: "all-exports",
        detail: "top-level statement changed",
      },
    ])
  })

  it("records why a changed bare import or star re-export widened", () => {
    const before = { "src/a.ts": lib("x"), "src/m.ts": "export const one = 1\n" }
    const bare = { ...before, "src/m.ts": 'import "./a.js"\nexport const one = 1\n' }
    const star = { ...before, "src/m.ts": 'export * from "./a.js"\nexport const one = 1\n' }
    for (const after of [bare, star]) {
      expect(affected(before, after).widened).toEqual([
        {
          reason: "module-side-effect",
          file: "src/m.ts",
          to: "all-exports",
          detail: "bare import or export * changed",
        },
      ])
    }
  })

  it("records a dynamically loading source with its widening", () => {
    const before = {
      "src/loader.ts": "export const load = (n: string) => require(n)\n",
      "src/a.ts": lib("x"),
    }
    const after = { ...before, "src/a.ts": "export const x = 2\n" }
    expect(affected(before, after).widened).toContainEqual({
      reason: "dynamic-import",
      file: "src/loader.ts",
      to: "all-exports",
    })
  })

  it("does not widen for dynamic loaders when nothing changed", () => {
    const files = { "src/loader.ts": "export const load = (n: string) => require(n)\n" }
    expect(affected(files, files).widened).toEqual([])
  })

  it("keeps a file reached by two routes at its nearest distance", () => {
    const before = {
      "src/a.ts": "export const x = 1\n",
      "src/mid.ts": 'import { x } from "./a.js"\nexport const m = x\n',
      "src/top.ts":
        'import { x } from "./a.js"\nimport { m } from "./mid.js"\nexport const t = [x, m]\n',
      "src/far.ts": 'import { m } from "./mid.js"\nexport const f = m\n',
    }
    const after = { ...before, "src/a.ts": "export const x = 2\n" }
    expect(affected(before, after).mutateTargets).toEqual(["src/a.ts", "src/mid.ts", "src/top.ts"])
  })

  it("lowers the distance of a symbol first reached the long way round", () => {
    const before = {
      "src/a.ts": "export const x = 1\nexport const y = 1\n",
      "src/b.ts": 'import { x } from "./a.js"\nexport const bx = x\nexport const by = 2\n',
      "src/c.ts": 'import { bx } from "./b.js"\nexport const cx = bx\n',
      "src/d.ts":
        'import { cx } from "./c.js"\nimport { x } from "./a.js"\nexport const dx = [cx, x]\n',
    }
    const after = { ...before, "src/a.ts": "export const x = 2\nexport const y = 1\n" }
    expect(affected(before, after).mutateTargets).toEqual(["src/a.ts", "src/b.ts", "src/d.ts"])
  })

  it("excludes a changed test and a deleted source from the changed sources", () => {
    const before = { "src/gone.ts": lib("g"), "t/a.test.ts": "export {}\n" }
    const after = { "t/a.test.ts": "export const changed = 1\n" }
    const result = affected(before, after)
    expect(result.affectedSources).toEqual([])
    expect(result.mutateTargets).toEqual([])
    expect(result.affectedTests).toEqual(["t/a.test.ts"])
  })

  it("reports changed files sorted and the full result in the same shape", () => {
    const result = affected({ "b.json": "1", "a.json": "1" }, { "b.json": "2", "a.json": "2" })
    expect(result.changedFiles).toEqual(["a.json", "b.json"])
    expect(result.changedSymbols).toEqual([])
    expect(result.causes.size).toBe(0)
  })

  it("lists every module in a full result, sources and tests apart", () => {
    const files = {
      "src/a.ts": lib("a"),
      "src/types.d.ts": "export type T = 1\n",
      "t/a.test.ts": "export {}\n",
      "package.json": "1",
    }
    const result = affected(files, { ...files, "package.json": "2" })
    expect(result.scope).toBe("full")
    expect(result.affectedSources).toEqual(["src/a.ts", "src/types.d.ts"])
    expect(result.affectedTests).toEqual(["t/a.test.ts"])
    expect(result.mutateTargets).toEqual(["src/a.ts"])
    expect(result.widened).toEqual([result.fullBecause])
  })

  it("matches several tests against one link rule and names the changed file as the cause", () => {
    const before = { "t/a.test.ts": "export {}\n", "t/b.test.ts": "export {}\n", "fx/g.txt": "1" }
    const result = affected(
      before,
      { ...before, "fx/g.txt": "2" },
      {
        links: [{ when: "fx/**", run: ["t/a.*", "t/b.*"] }],
      },
    )
    expect(result.affectedTests).toEqual(["t/a.test.ts", "t/b.test.ts"])
    expect(explainAffected(result)).toEqual([
      "t/a.test.ts must run <- fx/g.txt changed",
      "t/b.test.ts must run <- fx/g.txt changed",
    ])
  })

  it("does not add a linked test twice", () => {
    const before = { "t/a.test.ts": "export {}\n", "fx/g.txt": "1" }
    const result = affected(
      before,
      { ...before, "fx/g.txt": "2" },
      {
        links: [
          { when: "fx/**", run: ["t/**"] },
          { when: "**/*.txt", run: ["t/**"] },
        ],
      },
    )
    expect(result.affectedTests).toEqual(["t/a.test.ts"])
  })

  it("falls back to module resolution without tsconfig paths", () => {
    const before = { "src/a.ts": lib("x"), "t/a.test.ts": 'import { x } from "~/a"\nx\n' }
    const after = { ...before, "src/a.ts": "export const x = 2\n" }
    expect(affected(before, after).affectedTests).toEqual([])
    const resolved = computeAffected({
      ts,
      files: new Map(Object.entries(after)),
      baseFiles: new Map([["src/a.ts", before["src/a.ts"]]]),
      changed: [{ path: "src/a.ts", kind: "modified" }],
      compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } },
    })
    expect(resolved.affectedTests).toEqual(["t/a.test.ts"])
  })
})

describe("explainAffected: robustness", () => {
  it("stops at a cycle in a hand-built result", () => {
    const result: AffectedResult = {
      scope: "affected",
      changedFiles: [],
      changedSymbols: [],
      affectedSources: [],
      affectedTests: ["t.test.ts"],
      mutateTargets: [],
      widened: [],
      causes: new Map([
        ["test:t.test.ts", "any:a.ts"],
        ["any:a.ts", "test:t.test.ts"],
      ]),
    }
    expect(explainAffected(result)).toEqual(["t.test.ts must run <- a.ts has a changed export"])
  })

  it("does not trim a long chain", () => {
    const causes = new Map<string, string>([["test:t.test.ts", "changed:f0.ts"]])
    const result: AffectedResult = {
      scope: "affected",
      changedFiles: [],
      changedSymbols: [],
      affectedSources: [],
      affectedTests: ["t.test.ts"],
      mutateTargets: [],
      widened: [],
      causes,
    }
    for (let index = 0; index < 50; index += 1) {
      causes.set(`changed:f${index}.ts`, `changed:f${index + 1}.ts`)
    }
    expect(explainAffected(result)[0]?.split(" <- ")).toHaveLength(52)
  })

  it("names a full run without a recorded reason", () => {
    const result: AffectedResult = {
      scope: "full",
      changedFiles: [],
      changedSymbols: [],
      affectedSources: [],
      affectedTests: [],
      mutateTargets: [],
      widened: [],
      causes: new Map(),
    }
    expect(explainAffected(result)).toEqual(["full run: unknown reason"])
  })
})
