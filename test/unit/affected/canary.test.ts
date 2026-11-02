import { describe, expect, it } from "vitest"
import { findEscapes } from "../../../src/affected/canary.js"

describe("findEscapes", () => {
  it("is clean when every failing test was in the affected set", () => {
    expect(
      findEscapes({
        affectedTests: ["test/a.test.ts", "test/b.test.ts"],
        allTests: ["test/a.test.ts", "test/b.test.ts", "test/c.test.ts"],
        failedInFullRun: ["test/b.test.ts"],
      }),
    ).toEqual({ clean: true, escapes: [], checked: 3 })
  })

  it("reports a test that failed in the full run but was left out of the affected set", () => {
    const result = findEscapes({
      affectedTests: ["test/a.test.ts"],
      allTests: ["test/a.test.ts", "test/b.test.ts"],
      failedInFullRun: ["test/b.test.ts", "test/a.test.ts"],
    })
    expect(result).toEqual({ clean: false, escapes: ["test/b.test.ts"], checked: 2 })
  })

  it("is clean when nothing failed, whatever was affected", () => {
    expect(findEscapes({ affectedTests: [], allTests: ["t.ts"], failedInFullRun: [] }).clean).toBe(
      true,
    )
  })

  it("sorts and de-duplicates the escapes", () => {
    const result = findEscapes({
      affectedTests: [],
      allTests: ["b.ts", "a.ts"],
      failedInFullRun: ["b.ts", "a.ts", "b.ts"],
    })
    expect(result.escapes).toEqual(["a.ts", "b.ts"])
  })

  it("treats a failure in a test it was never told about as an escape too", () => {
    const result = findEscapes({
      affectedTests: [],
      allTests: [],
      failedInFullRun: ["new.test.ts"],
    })
    expect(result).toEqual({ clean: false, escapes: ["new.test.ts"], checked: 0 })
  })

  it("does not call a failure an escape when the affected analysis ran everything", () => {
    const all = ["a.ts", "b.ts"]
    expect(findEscapes({ affectedTests: all, allTests: all, failedInFullRun: all }).clean).toBe(
      true,
    )
  })
})
