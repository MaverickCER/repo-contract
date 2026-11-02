import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  computeAffected,
  computeAffectedFromGit,
  explainAffected,
  parseNameStatus,
} from "../../../src/affected/index.js"
import { fakeGit } from "./fake-git.js"
import type { FakeRepo } from "./fake-git.js"

const base = {
  "src/a.ts": "export const a = 1\n",
  "src/b.ts": 'import { a } from "./a.js"\nexport const b = a\n',
  "test/b.test.ts": 'import { b } from "../src/b.js"\nb\n',
  "test/other.test.ts": "export {}\n",
  "README.md": "readme\n",
}

const without = (tree: Record<string, string>, path: string): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).filter(([name]) => name !== path))

const affectedFor = async (repo: Partial<FakeRepo> & Pick<FakeRepo, "work">, extra = {}) => {
  const { capabilities, calls } = fakeGit({ base, ...repo })
  const result = await computeAffectedFromGit({ ts, capabilities, ...extra })
  return { result, calls }
}

describe("parseNameStatus", () => {
  it("parses each status the diff can report", () => {
    expect(
      parseNameStatus(
        "M\0a.ts\0A\0b.ts\0D\0c.ts\0T\0d.ts\0R087\0old.ts\0new.ts\0C100\0src.ts\0copy.ts\0",
      ),
    ).toEqual([
      { path: "a.ts", kind: "modified" },
      { path: "b.ts", kind: "added" },
      { path: "c.ts", kind: "deleted" },
      { path: "d.ts", kind: "modified" },
      { path: "new.ts", kind: "renamed", renamedFrom: "old.ts" },
      { path: "copy.ts", kind: "added" },
    ])
  })

  it("keeps spaces, newlines and unicode in paths", () => {
    expect(parseNameStatus("M\0a b\nc.ts\0A\0é.ts\0")).toEqual([
      { path: "a b\nc.ts", kind: "modified" },
      { path: "é.ts", kind: "added" },
    ])
  })

  it("accepts an empty diff, with or without the trailing separator", () => {
    expect(parseNameStatus("")).toEqual([])
    expect(parseNameStatus("M\0a.ts")).toEqual([{ path: "a.ts", kind: "modified" }])
  })

  it.each([
    ["an unknown status", "X\0a.ts\0"],
    ["an unmerged path", "U\0a.ts\0"],
    ["a status with no path", "M\0"],
    ["a rename with one path", "R100\0old.ts\0"],
    ["an empty status", "\0a.ts\0"],
  ])("refuses %s rather than guess", (_name, output) => {
    expect(parseNameStatus(output)).toBeUndefined()
  })
})

describe("computeAffectedFromGit: the happy path", () => {
  it("reports the tests a working-tree edit can affect", async () => {
    const { result } = await affectedFor({ work: { ...base, "src/a.ts": "export const a = 2\n" } })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
    expect(explainAffected(result)[0]).toMatch(/^test\/b\.test\.ts must run <- /)
  })

  it("reports nothing for a clean tree", async () => {
    const { result } = await affectedFor({ work: base })
    expect(result.scope).toBe("affected")
    expect(result.changedFiles).toEqual([])
    expect(result.affectedTests).toEqual([])
  })

  it("treats an untracked module as added", async () => {
    const { result } = await affectedFor({
      work: base,
      untracked: { "src/new.ts": "export const n = 1\n" },
    })
    expect(result.changedFiles).toEqual(["src/new.ts"])
    expect(result.mutateTargets).toEqual(["src/new.ts"])
  })

  it("runs an untracked test file", async () => {
    const { result } = await affectedFor({
      work: base,
      untracked: { "test/new.test.ts": "export {}\n" },
    })
    expect(result.affectedTests).toEqual(["test/new.test.ts"])
  })

  it("affects the importers of a deleted module", async () => {
    const work = without(base, "src/a.ts")
    const { result } = await affectedFor({ work })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("follows a rename", async () => {
    const { [`src/a.ts`]: content, ...rest } = base
    const { result } = await affectedFor({
      work: {
        ...rest,
        "src/renamed.ts": content,
        "src/b.ts": 'import { a } from "./renamed.js"\nexport const b = a\n',
      },
    })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("passes compiler options through to module resolution", async () => {
    const { result } = await affectedFor(
      {
        work: {
          ...base,
          "src/a.ts": "export const a = 2\n",
          "test/b.test.ts": 'import { a } from "~/a"\na\n',
        },
      },
      { compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } } },
    )
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("reads paths from tsconfig.json by itself", async () => {
    const { result } = await affectedFor({
      work: {
        ...base,
        "src/a.ts": "export const a = 2\n",
        "test/b.test.ts": 'import { a } from "~/a"\na\n',
        "tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }',
      },
      base: {
        ...base,
        "tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }',
      },
    })
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("reads the tsconfig it is told to", async () => {
    const config = '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }'
    const { result } = await affectedFor(
      {
        work: {
          ...base,
          "src/a.ts": "export const a = 2\n",
          "test/b.test.ts": 'import { a } from "~/a"\na\n',
          "cfg/tsconfig.app.json": config,
        },
        base: { ...base, "cfg/tsconfig.app.json": config },
      },
      { tsconfig: "cfg/tsconfig.app.json" },
    )
    expect(result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("goes full when the tsconfig cannot be understood", async () => {
    const { result } = await affectedFor({
      work: { ...base, "src/a.ts": "export const a = 2\n", "tsconfig.json": "{ nope" },
      base: { ...base, "tsconfig.json": "{ nope" },
    })
    expect(result.fullBecause).toEqual({
      reason: "tsconfig",
      file: "tsconfig.json",
      to: "full",
      detail: "could not be parsed",
    })
  })

  it("does not read the tsconfig when it is given compiler options", async () => {
    const { calls } = await affectedFor({ work: base }, { compilerOptions: {} })
    expect(calls.read).not.toContain("tsconfig.json")
  })

  it("passes options through to the engine", async () => {
    const { result } = await affectedFor(
      { work: { ...base, "README.md": "changed\n" } },
      { options: { ignore: ["README.md"] } },
    )
    expect(result.scope).toBe("affected")
  })

  it("agrees with the engine given the same data", async () => {
    const work = { ...base, "src/a.ts": "export const a = 2\n" }
    const { result } = await affectedFor({ work })
    const direct = computeAffected({
      ts,
      files: new Map(Object.entries(work).filter(([path]) => path.endsWith(".ts"))),
      baseFiles: new Map([["src/a.ts", base["src/a.ts"]]]),
      changed: [{ path: "src/a.ts", kind: "modified" }],
    })
    expect(result).toEqual(direct)
  })
})

describe("computeAffectedFromGit: choosing the base", () => {
  it("uses the base it is given", async () => {
    const { calls } = await affectedFor({ work: base, refs: ["release"] }, { base: "release" })
    expect(calls.git[0]).toBe("merge-base release HEAD")
  })

  it("does not fall back when a given base cannot be resolved", async () => {
    const { result, calls } = await affectedFor(
      { work: base, refs: ["origin/main"] },
      { base: "nope" },
    )
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({
      reason: "git-failed",
      file: "nope",
      detail: "base ref could not be resolved",
    })
    expect(calls.git.filter((command) => command.startsWith("merge-base"))).toEqual([
      "merge-base nope HEAD",
    ])
    expect(result.affectedTests).toEqual(["test/b.test.ts", "test/other.test.ts"])
  })

  it("tries the upstream branch, then origin/main, then origin/master", async () => {
    const first = await affectedFor({ work: base, refs: ["@{upstream}", "origin/main"] })
    expect(first.calls.git[0]).toBe("merge-base @{upstream} HEAD")
    const second = await affectedFor({ work: base, refs: ["origin/main"] })
    expect(second.calls.git.slice(0, 2)).toEqual([
      "merge-base @{upstream} HEAD",
      "merge-base origin/main HEAD",
    ])
    const third = await affectedFor({ work: base, refs: ["origin/master"] })
    expect(third.calls.git.slice(0, 3)).toEqual([
      "merge-base @{upstream} HEAD",
      "merge-base origin/main HEAD",
      "merge-base origin/master HEAD",
    ])
    expect(third.result.scope).toBe("affected")
  })

  it("goes full, naming the problem, when no base can be found", async () => {
    const { result } = await affectedFor({ work: base, refs: [] })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({
      reason: "git-failed",
      detail: "no base to compare against",
    })
    expect(result.affectedTests).toEqual(["test/b.test.ts", "test/other.test.ts"])
    expect(explainAffected(result)).toEqual([
      "full run: git-failed (merge-base) -- no base to compare against",
    ])
  })

  it("diffs against the resolved merge base, not the ref", async () => {
    const { calls } = await affectedFor({ work: base })
    expect(calls.git).toContain(`diff --name-status -M -z --no-ext-diff ${"b".repeat(40)}`)
  })
})

describe("computeAffectedFromGit: failures widen instead of guessing", () => {
  const sha = "b".repeat(40)
  it.each([
    ["the diff", `diff --name-status -M -z --no-ext-diff ${sha}`],
    ["listing untracked files", "ls-files --others --exclude-standard -z"],
    ["listing tracked files", "ls-files --cached --others --exclude-standard -z"],
  ])("goes full when %s fails", async (_name, command) => {
    const { result } = await affectedFor({ work: base, failing: [command] })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({ reason: "git-failed", file: command.split(" ")[0] })
  })

  it("goes full when the diff has a status it does not understand", async () => {
    const { capabilities } = fakeGit({ base, work: base })
    const result = await computeAffectedFromGit({
      ts,
      capabilities: {
        ...capabilities,
        git: async (args) => (args[0] === "diff" ? "X\0a.ts\0" : capabilities.git(args)),
      },
    })
    expect(result.fullBecause).toMatchObject({
      reason: "git-failed",
      file: "diff",
      detail: "unrecognised name-status output",
    })
  })

  it("goes full when the base content of a modified module cannot be read", async () => {
    const { capabilities } = fakeGit({
      base,
      work: { ...base, "src/a.ts": "export const a = 2\n" },
    })
    const result = await computeAffectedFromGit({
      ts,
      capabilities: {
        ...capabilities,
        git: async (args) => (args[0] === "show" ? undefined : capabilities.git(args)),
      },
    })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({ reason: "unplaced-file", file: "src/a.ts" })
  })

  it("goes full when a changed module cannot be read", async () => {
    const { result } = await affectedFor({
      work: { ...base, "src/a.ts": "export const a = 2\n" },
      unreadable: ["src/a.ts"],
    })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({ reason: "unplaced-file", file: "src/a.ts" })
  })

  it("skips an unreadable module that did not change", async () => {
    const { result } = await affectedFor({
      work: { ...base, "README.md": "x\n" },
      unreadable: ["src/b.ts"],
    })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toMatchObject({ reason: "unplaced-file", file: "README.md" })
  })
})

describe("computeAffectedFromGit: reads only what it needs", () => {
  it("reads module files and no others", async () => {
    const { calls } = await affectedFor({
      work: {
        ...base,
        "data.json": "{}",
        "src/c.mts": "export {}",
        "src/d.js": "export {}",
        "x.d.ts": "export {}",
      },
      base: {
        ...base,
        "data.json": "{}",
        "src/c.mts": "export {}",
        "src/d.js": "export {}",
        "x.d.ts": "export {}",
      },
    })
    expect(calls.read.sort()).toEqual(
      [
        "src/a.ts",
        "src/b.ts",
        "src/c.mts",
        "src/d.js",
        "test/b.test.ts",
        "test/other.test.ts",
        "tsconfig.json",
        "x.d.ts",
      ].sort(),
    )
  })

  it("fetches base content only for changed modules that existed at the base", async () => {
    const { calls } = await affectedFor({
      work: { ...base, "src/a.ts": "export const a = 2\n", "src/new.ts": "export {}\n" },
    })
    expect(calls.git.filter((command) => command.startsWith("show "))).toEqual([
      `show ${"b".repeat(40)}:src/a.ts`,
    ])
  })

  it("fetches the base of a deleted module", async () => {
    const work = without(base, "src/a.ts")
    const { calls } = await affectedFor({ work })
    expect(calls.git.filter((command) => command.startsWith("show "))).toEqual([
      `show ${"b".repeat(40)}:src/a.ts`,
    ])
  })

  it("fetches the base of a renamed-from module, not the new path", async () => {
    const { [`src/a.ts`]: content, ...rest } = base
    const { calls } = await affectedFor({ work: { ...rest, "src/renamed.ts": content } })
    expect(calls.git.filter((command) => command.startsWith("show "))).toEqual([
      `show ${"b".repeat(40)}:src/a.ts`,
    ])
  })

  it("does not fetch the base of a changed non-module", async () => {
    const { calls } = await affectedFor({ work: { ...base, "README.md": "changed\n" } })
    expect(calls.git.some((command) => command.startsWith("show "))).toBe(false)
  })
})

describe("computeAffected: a caller-supplied reason to go full", () => {
  it("returns that reason with the whole project affected", () => {
    const result = computeAffected({
      ts,
      files: new Map([
        ["src/a.ts", "export {}"],
        ["t/a.test.ts", "export {}"],
      ]),
      baseFiles: new Map(),
      changed: [],
      fullBecause: { reason: "git-failed", file: "diff", to: "full", detail: "x" },
    })
    expect(result.scope).toBe("full")
    expect(result.fullBecause).toEqual({
      reason: "git-failed",
      file: "diff",
      to: "full",
      detail: "x",
    })
    expect(result.affectedTests).toEqual(["t/a.test.ts"])
    expect(result.affectedSources).toEqual(["src/a.ts"])
  })
})

describe("parseNameStatus: entries of different lengths", () => {
  it("reads entries that follow a rename or a copy at the right place", () => {
    expect(parseNameStatus("R100\0o.ts\0n.ts\0M\0a.ts\0C75\0s.ts\0c.ts\0D\0d.ts\0")).toEqual([
      { path: "n.ts", kind: "renamed", renamedFrom: "o.ts" },
      { path: "a.ts", kind: "modified" },
      { path: "c.ts", kind: "added" },
      { path: "d.ts", kind: "deleted" },
    ])
  })

  it("refuses an empty path wherever it appears", () => {
    for (const output of [
      "M\0\0",
      "M\0a.ts\0A\0\0",
      "R100\0\0n.ts\0",
      "R100\0o.ts\0\0",
      "C100\0o.ts\0\0",
    ]) {
      expect(parseNameStatus(output)).toBeUndefined()
    }
  })

  it("takes only the first letter of a status as the status", () => {
    expect(parseNameStatus("M100\0a.ts\0")).toEqual([{ path: "a.ts", kind: "modified" }])
    expect(parseNameStatus("Rx\0o.ts\0n.ts\0")).toEqual([
      { path: "n.ts", kind: "renamed", renamedFrom: "o.ts" },
    ])
  })
})

describe("computeAffectedFromGit: what a failure says", () => {
  const sha = "b".repeat(40)
  const full = (detail: string, file: string) => ({
    reason: "git-failed",
    file,
    to: "full",
    detail,
  })

  it("says, exactly, why it could not compare", async () => {
    expect((await affectedFor({ work: base, refs: [] })).result.fullBecause).toEqual(
      full("no base to compare against", "merge-base"),
    )
    expect((await affectedFor({ work: base }, { base: "nope" })).result.fullBecause).toEqual(
      full("base ref could not be resolved", "nope"),
    )
    expect(
      (
        await affectedFor({
          work: base,
          failing: ["ls-files --cached --others --exclude-standard -z"],
        })
      ).result.fullBecause,
    ).toEqual(full("could not list the repository's files", "ls-files"))
    expect(
      (
        await affectedFor({
          work: base,
          failing: [`diff --name-status -M -z --no-ext-diff ${sha}`],
        })
      ).result.fullBecause,
    ).toEqual(full("could not diff against the base", "diff"))
    expect(
      (await affectedFor({ work: base, failing: ["ls-files --others --exclude-standard -z"] }))
        .result.fullBecause,
    ).toEqual(full("could not list untracked files", "ls-files"))
  })

  it("does not take an empty answer from merge-base for a commit", async () => {
    const { capabilities } = fakeGit({ base, work: base })
    for (const answer of ["", "\n", "  \n"]) {
      const result = await computeAffectedFromGit({
        ts,
        capabilities: {
          ...capabilities,
          git: async (args) => (args[0] === "merge-base" ? answer : capabilities.git(args)),
        },
      })
      expect(result.fullBecause).toEqual(full("no base to compare against", "merge-base"))
    }
  })

  it("is full when git cannot even list files, and still names every module it could read", async () => {
    const { result } = await affectedFor({
      work: base,
      failing: ["ls-files --cached --others --exclude-standard -z"],
    })
    expect(result.scope).toBe("full")
    expect(result.affectedTests).toEqual([])
  })
})

describe("computeAffectedFromGit: untracked files and module resolution", () => {
  const alias = '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }'
  const withAlias = { ...base, "test/alias.test.ts": 'import { a } from "~/a"\na\n' }
  const edit = { "src/a.ts": "export const a = 2\n" }

  it("treats an untracked module as new: every export it has is a changed symbol", async () => {
    const { result, calls } = await affectedFor({
      work: base,
      untracked: { "src/new.ts": "export const fresh = 1\nexport const other = 2\n" },
    })
    expect(calls.git.filter((command) => command.startsWith("show "))).toEqual([])
    expect(result.changedSymbols).toEqual(["src/new.ts#fresh", "src/new.ts#other"])
    expect(result.changedFiles).toEqual(["src/new.ts"])
  })

  it("resolves an alias from the compiler options it is given, and from nowhere else", async () => {
    const given = await affectedFor(
      { base: withAlias, work: { ...withAlias, ...edit } },
      { compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } } },
    )
    expect(given.result.widened).toEqual([])
    expect(given.result.affectedTests).toEqual(["test/alias.test.ts", "test/b.test.ts"])
    const none = await affectedFor({ base: withAlias, work: { ...withAlias, ...edit } })
    expect(none.result.affectedTests).toEqual(["test/b.test.ts"])
  })

  it("reads the tsconfig it is told to, and ignores tsconfig.json then", async () => {
    const files = {
      ...withAlias,
      "cfg/tsconfig.app.json": alias.replace('"."', '".."'),
      "tsconfig.json": "{ nope",
    }
    const { result, calls } = await affectedFor(
      { base: files, work: { ...files, ...edit } },
      { tsconfig: "cfg/tsconfig.app.json" },
    )
    expect(result.scope).toBe("affected")
    expect(result.affectedTests).toEqual(["test/alias.test.ts", "test/b.test.ts"])
    expect(calls.read).not.toContain("tsconfig.json")
  })

  it("reads tsconfig.json when told nothing", async () => {
    const files = { ...withAlias, "tsconfig.json": alias }
    const { result, calls } = await affectedFor({ base: files, work: { ...files, ...edit } })
    expect(result.affectedTests).toEqual(["test/alias.test.ts", "test/b.test.ts"])
    expect(calls.read).toContain("tsconfig.json")
  })

  it("passes the engine's options through and applies them", async () => {
    const work = { ...base, "README.md": "changed\n", "fixtures/data.json": "{}\n" }
    const plain = await affectedFor({ work })
    expect(plain.result.scope).toBe("full")
    const tuned = await affectedFor(
      { work },
      {
        options: {
          ignore: ["README.md"],
          links: [{ when: "fixtures/**", run: ["test/other.test.ts"] }],
        },
      },
    )
    expect(tuned.result.scope).toBe("affected")
    expect(tuned.result.affectedTests).toEqual(["test/other.test.ts"])
  })
})

describe("computeAffectedFromGit: a full answer has no changes of its own", () => {
  it("reports no changed files when it could not compare", async () => {
    const result = (
      await affectedFor({ work: { ...base, "src/new.ts": "export const n = 1\n" }, refs: [] })
    ).result
    expect(result.scope).toBe("full")
    expect(result.changedFiles).toEqual([])
    expect(result.changedSymbols).toEqual([])
  })
})
