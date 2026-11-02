import { describe, expect, it } from "vitest"
import { parseAffectedConfig } from "../../../src/affected/index.js"

describe("parseAffectedConfig", () => {
  it("accepts an absent block as no options", () => {
    expect(parseAffectedConfig(undefined)).toEqual({ options: {} })
  })

  it("accepts every documented key", () => {
    const block = {
      ignore: ["docs/**"],
      triggers: ["Makefile"],
      tests: ["**/*.check.ts"],
      notMutated: ["scripts/**"],
      links: [{ when: "fixtures/**", run: ["test/**"] }],
    }
    expect(parseAffectedConfig(block)).toEqual({ options: block })
  })

  it("accepts empty lists", () => {
    expect(parseAffectedConfig({ ignore: [], links: [] })).toEqual({
      options: { ignore: [], links: [] },
    })
  })

  it.each([
    ["a string", "x", "must be an object"],
    ["null", null, "must be an object"],
    ["an array", [], "must be an object"],
    ["a number", 3, "must be an object"],
  ])("rejects a block that is %s", (_name, value, message) => {
    expect(parseAffectedConfig(value)).toEqual({ error: message })
  })

  it("rejects an unknown key, naming it and the valid ones", () => {
    expect(parseAffectedConfig({ ignroe: [] })).toEqual({
      error: "unknown key 'ignroe' (expected one of: ignore, triggers, tests, notMutated, links)",
    })
  })

  it.each(["ignore", "triggers", "tests", "notMutated"])("rejects a non-list %s", (key) => {
    expect(parseAffectedConfig({ [key]: "docs/**" })).toEqual({
      error: `'${key}' must be a list of glob strings`,
    })
  })

  it.each(["ignore", "triggers", "tests", "notMutated"])(
    "rejects a non-string item in %s",
    (key) => {
      expect(parseAffectedConfig({ [key]: ["ok", 1] })).toEqual({
        error: `'${key}' must be a list of glob strings`,
      })
    },
  )

  it.each(["", "   "])("rejects an empty glob %j", (glob) => {
    expect(parseAffectedConfig({ ignore: [glob] })).toEqual({
      error: "'ignore' must not contain an empty glob",
    })
  })

  it("rejects links that are not a list", () => {
    expect(parseAffectedConfig({ links: {} })).toEqual({ error: "'links' must be a list" })
  })

  it.each([
    [{ run: ["t/**"] }, "link 0 needs a 'when' glob"],
    [{ when: "", run: ["t/**"] }, "link 0 needs a 'when' glob"],
    [{ when: 3, run: ["t/**"] }, "link 0 needs a 'when' glob"],
    [{ when: "x" }, "link 0 needs a 'run' list of globs"],
    [{ when: "x", run: [] }, "link 0 needs a 'run' list of globs"],
    [{ when: "x", run: [1] }, "link 0 needs a 'run' list of globs"],
    [{ when: "x", run: ["t/**"], extra: 1 }, "link 0 has unknown key 'extra'"],
    ["nope", "link 0 must be an object"],
    [null, "link 0 must be an object"],
  ])("rejects the link %j", (link, message) => {
    expect(parseAffectedConfig({ links: [link] })).toEqual({ error: message })
  })

  it("numbers the offending link", () => {
    expect(parseAffectedConfig({ links: [{ when: "a", run: ["b"] }, { when: "c" }] })).toEqual({
      error: "link 1 needs a 'run' list of globs",
    })
  })

  it("does not alias the caller's arrays", () => {
    const ignore = ["a"]
    const parsed = parseAffectedConfig({ ignore })
    ignore.push("b")
    expect(parsed).toEqual({ options: { ignore: ["a"] } })
  })
})

describe("link rules reject blank globs", () => {
  const links = (link: object) => parseAffectedConfig({ links: [link] })

  it("rejects a blank 'when', however it is spaced", () => {
    for (const when of ["", " ", "\t\n"]) {
      expect(links({ when, run: ["a/**"] })).toEqual({
        error: "link 0 needs a 'when' glob",
      })
    }
  })

  it("rejects a 'run' list that holds any blank glob, not only when all are blank", () => {
    for (const run of [[""], ["  "], ["a/**", ""], ["a/**", "  "], ["", "a/**"]]) {
      expect(links({ when: "x/**", run })).toEqual({
        error: "link 0 needs a 'run' list of globs",
      })
    }
  })

  it("accepts globs that merely contain spaces", () => {
    expect(links({ when: "a b/**", run: ["c d/**"] })).toEqual({
      options: { links: [{ when: "a b/**", run: ["c d/**"] }] },
    })
  })
})
