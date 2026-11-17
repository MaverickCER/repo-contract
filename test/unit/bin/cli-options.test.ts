import path from "node:path"
import { describe, expect, it } from "vitest"
import { commandDirectory, messageOf, parseCommandOptions } from "../../../bin/cli-options.mjs"

const SPEC = {
  values: { "--dir": "dir", "-C": "cwd" },
  repeated: { "--set": "set" },
  flags: { "--json": "json" },
  positionals: 1,
}

describe("parseCommandOptions", () => {
  it.each([[["--help"]], [["-h"]], [["x", "-h"]], [["--dir", "d", "--help"]]])(
    "reads %j as help",
    (argv) => {
      expect(parseCommandOptions(argv, SPEC)).toStrictEqual({ kind: "help" })
    },
  )

  it.each([[["--version"]], [["-V"]], [["x", "--version"]]])("reads %j as version", (argv) => {
    expect(parseCommandOptions(argv, SPEC)).toStrictEqual({ kind: "version" })
  })

  it("reads values, repeated values, flags and a positional", () => {
    expect(
      parseCommandOptions(
        ["id", "--dir", "d", "--set", "a=1", "--set=b=2", "-C", "sub", "--json"],
        SPEC,
      ),
    ).toStrictEqual({
      kind: "run",
      options: { set: ["a=1", "b=2"], dir: "d", cwd: "sub", json: true },
      positionals: ["id"],
    })
  })

  it("starts every repeated option as an empty list and leaves the rest unset", () => {
    expect(parseCommandOptions([], SPEC)).toStrictEqual({
      kind: "run",
      options: { set: [] },
      positionals: [],
    })
    expect(parseCommandOptions([], { values: {} })).toStrictEqual({
      kind: "run",
      options: {},
      positionals: [],
    })
  })

  it("lets a later value replace an earlier one", () => {
    expect(parseCommandOptions(["--dir", "a", "--dir=b"], SPEC)).toMatchObject({
      options: { dir: "b" },
    })
  })

  it("takes a value after `=` even when it starts with -", () => {
    expect(parseCommandOptions(["--dir=-x"], SPEC)).toMatchObject({
      kind: "run",
      options: { dir: "-x" },
    })
  })

  it.each([
    [["--dir"], "option '--dir' needs a value"],
    [["--dir="], "option '--dir' needs a value"],
    [["--dir", ""], "option '--dir' needs a value"],
    [["--dir", "--json"], "option '--dir' needs a value"],
    [["--dir", "-x"], "option '--dir' needs a value"],
    [["--dir", "--", "x"], "option '--dir' needs a value"],
    [["--set"], "option '--set' needs a value"],
    [["-C"], "option '-C' needs a value"],
    [["--json=1"], "unknown option '--json=1'"],
    [["--bogus"], "unknown option '--bogus'"],
    [["-x"], "unknown option '-x'"],
    [["-C=sub"], "unknown option '-C=sub'"],
    [["a", "b"], "unexpected argument 'b'"],
    [["a", "--", "b"], "unexpected argument 'b'"],
  ])("rejects %j", (argv, message) => {
    expect(parseCommandOptions(argv, SPEC)).toStrictEqual({ kind: "error", message })
  })

  it("reads a lone - as a positional", () => {
    expect(parseCommandOptions(["-"], SPEC)).toMatchObject({ kind: "run", positionals: ["-"] })
  })

  it("reads everything after -- as positionals, options and help included", () => {
    expect(parseCommandOptions(["--json", "--", "--help"], SPEC)).toStrictEqual({
      kind: "run",
      options: { set: [], json: true },
      positionals: ["--help"],
    })
    expect(parseCommandOptions(["--", "--dir", "d"], { ...SPEC, positionals: 2 })).toStrictEqual({
      kind: "run",
      options: { set: [] },
      positionals: ["--dir", "d"],
    })
    expect(parseCommandOptions(["a", "--", "-V"], { ...SPEC, positionals: 2 })).toMatchObject({
      positionals: ["a", "-V"],
    })
    expect(parseCommandOptions(["--"], SPEC)).toMatchObject({ kind: "run", positionals: [] })
  })

  it("takes no positional when the spec names none", () => {
    expect(parseCommandOptions(["x"], { values: {} })).toStrictEqual({
      kind: "error",
      message: "unexpected argument 'x'",
    })
  })

  it("takes exactly as many positionals as the spec allows", () => {
    expect(parseCommandOptions(["a", "b"], { values: {}, positionals: 2 })).toMatchObject({
      kind: "run",
      positionals: ["a", "b"],
    })
    expect(parseCommandOptions(["a", "b", "c"], { values: {}, positionals: 2 })).toStrictEqual({
      kind: "error",
      message: "unexpected argument 'c'",
    })
  })
})

describe("messageOf", () => {
  it("reads an Error's message and stringifies anything else", () => {
    expect(messageOf(new Error("boom"))).toBe("boom")
    expect(messageOf("plain")).toBe("plain")
    expect(messageOf(42)).toBe("42")
  })
})

describe("commandDirectory", () => {
  it("resolves -C against where the process started, or uses that directory", () => {
    const start = path.resolve("/work/app")
    expect(commandDirectory(start, undefined)).toBe(start)
    expect(commandDirectory(start, "sub")).toBe(path.join(start, "sub"))
    expect(commandDirectory(start, "..")).toBe(path.dirname(start))
    expect(commandDirectory("relative", undefined)).toBe(path.resolve("relative"))
  })
})
