import { describe, expect, it } from "vitest"
import { explainAffected } from "../../../src/affected/explain.js"
import { changedKey, exportKey, localKey, sourceKey, testKey } from "../../../src/affected/keys.js"
import type { AffectedResult } from "../../../src/affected/types.js"

const result = (patch: Partial<AffectedResult>): AffectedResult => ({
  scope: "affected",
  changedFiles: [],
  changedSymbols: [],
  affectedSources: [],
  affectedTests: [],
  mutateTargets: [],
  widened: [],
  causes: new Map(),
  ...patch,
})

describe("explainAffected", () => {
  it("says why everything is affected, with the file and the detail", () => {
    expect(
      explainAffected(
        result({
          scope: "full",
          fullBecause: {
            reason: "global-trigger",
            file: "package.json",
            to: "full",
            detail: "lockfile",
          },
        }),
      ),
    ).toEqual(["full run: global-trigger (package.json: lockfile)"])
  })

  it("omits the detail when there is none, and says so when there is no reason", () => {
    expect(
      explainAffected(
        result({ scope: "full", fullBecause: { reason: "git-failed", file: "git", to: "full" } }),
      ),
    ).toEqual(["full run: git-failed (git)"])
    expect(explainAffected(result({ scope: "full" }))).toEqual(["full run: unknown reason"])
  })

  it("follows each test's causes back to the change, one line per test", () => {
    const causes = new Map([
      [testKey("test/b.test.ts"), sourceKey("src/b.ts")],
      [sourceKey("src/b.ts"), exportKey("src/a.ts", "foo")],
      [exportKey("src/a.ts", "foo"), changedKey("src/a.ts")],
    ])
    const lines = explainAffected(result({ affectedTests: ["test/b.test.ts"], causes }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^test\/b\.test\.ts/)
    expect(lines[0]?.split(" <- ")).toHaveLength(4)
  })

  it("gives a test with no recorded cause a line of its own", () => {
    expect(explainAffected(result({ affectedTests: ["test/x.test.ts"] }))).toEqual([
      "test/x.test.ts must run",
    ])
  })

  it("hides a renamed binding inside one file unless it leads to the change itself", () => {
    const hidden = new Map([
      [testKey("t.test.ts"), localKey("src/a.ts", "x")],
      [localKey("src/a.ts", "x"), exportKey("src/a.ts", "y")],
    ])
    expect(
      explainAffected(result({ affectedTests: ["t.test.ts"], causes: hidden }))[0]?.split(" <- "),
    ).toHaveLength(2)
    const shown = new Map([
      [testKey("t.test.ts"), localKey("src/a.ts", "x")],
      [localKey("src/a.ts", "x"), changedKey("src/a.ts")],
    ])
    expect(
      explainAffected(result({ affectedTests: ["t.test.ts"], causes: shown }))[0]?.split(" <- "),
    ).toHaveLength(3)
  })

  it("copes with a chain that ends on a local name", () => {
    const causes = new Map([[testKey("t.test.ts"), localKey("src/a.ts", "x")]])
    expect(
      explainAffected(result({ affectedTests: ["t.test.ts"], causes }))[0]?.split(" <- "),
    ).toHaveLength(1)
  })
})
