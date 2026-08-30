import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  discoverSuppressions,
  discoverSuppressionsInFile,
} from "../../../scripts/suppression-governance/discover-suppressions.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"

describe("discoverSuppressionsInFile", () => {
  it("finds nothing in a file with no suppression comments", () => {
    const text = [
      "export function add(a: number, b: number): number {",
      "  return a + b",
      "}",
    ].join("\n")

    expect(discoverSuppressionsInFile("src/add.ts", text)).toEqual([])
  })

  it("finds one eslint suppression, with its correct starting line", () => {
    const text = ["const x = 1", "// eslint-disable-next-line no-console", "console.log(x)"].join(
      "\n",
    )

    expect(discoverSuppressionsInFile("src/x.ts", text)).toEqual([
      {
        file: "src/x.ts",
        line: 2,
        domain: "eslint",
        rule: ["no-console"],
        content: "eslint-disable-next-line no-console",
        reason: "",
      },
    ])
  })

  it("finds one TypeScript suppression", () => {
    const text = ["// @ts-expect-error legacy", 'const x: number = "nope"'].join("\n")

    expect(discoverSuppressionsInFile("src/x.ts", text)).toEqual([
      {
        file: "src/x.ts",
        line: 1,
        domain: "typescript",
        rule: ["@ts-expect-error"],
        content: "@ts-expect-error legacy",
        reason: "legacy",
      },
    ])
  })

  it("finds one Stryker suppression", () => {
    const text = [
      "const x = 1",
      "// Stryker disable next-line ConditionalExpression -- unreachable given the caller's own contract",
      "if (x) doSomething()",
    ].join("\n")

    expect(discoverSuppressionsInFile("src/x.ts", text)).toEqual([
      {
        file: "src/x.ts",
        line: 2,
        domain: "stryker",
        rule: ["ConditionalExpression"],
        content:
          "Stryker disable next-line ConditionalExpression -- unreachable given the caller's own contract",
        reason: "unreachable given the caller's own contract",
      },
    ])
  })

  it("finds a multiline eslint-disable block, with its opening delimiter's line", () => {
    const text = [
      "const x = 1",
      "/* eslint-disable security/detect-object-injection",
      " * security/detect-unsafe-regex",
      " */",
      "const y = 2",
    ].join("\n")

    const found = discoverSuppressionsInFile("src/x.ts", text)
    expect(found).toHaveLength(1)
    expect(found[0]).toEqual({
      file: "src/x.ts",
      line: 2,
      domain: "eslint",
      rule: ["security/detect-object-injection", "security/detect-unsafe-regex"],
      content: "eslint-disable security/detect-object-injection security/detect-unsafe-regex",
      reason: "",
    })
  })

  it("finds multiple rules named in a single directive", () => {
    const text = "// eslint-disable-next-line no-console, no-alert"

    expect(discoverSuppressionsInFile("src/x.ts", text)[0]?.rule).toEqual([
      "no-console",
      "no-alert",
    ])
  })

  it("finds multiple independent suppressions in one file, each with its own line", () => {
    const text = [
      "// eslint-disable-next-line no-console",
      "console.log(1)",
      "// @ts-ignore",
      'const x: number = "nope"',
    ].join("\n")

    const found = discoverSuppressionsInFile("src/x.ts", text)
    expect(found).toHaveLength(2)
    expect(found.map((f) => f.line)).toEqual([1, 3])
    expect(found.map((f) => f.domain)).toEqual(["eslint", "typescript"])
  })

  it("finds duplicate-looking suppressions independently, each at its own line", () => {
    const text = [
      "// eslint-disable-next-line no-console",
      "console.log(1)",
      "// eslint-disable-next-line no-console",
      "console.log(2)",
    ].join("\n")

    const found = discoverSuppressionsInFile("src/x.ts", text)
    expect(found).toHaveLength(2)
    expect(found.map((f) => f.line)).toEqual([1, 3])
    expect(found[0]?.content).toBe(found[1]?.content)
  })

  it("does not mistake an ordinary comment for a suppression", () => {
    const text = "// this explains the next line, nothing more"

    expect(discoverSuppressionsInFile("src/x.ts", text)).toEqual([])
  })

  it("does not desync on a template literal substitution, and still finds a real suppression afterward", () => {
    // `${...}` template substitutions require the scanner's own `reScanTemplateToken` to resume
    // correctly after the substitution's closing brace -- skip that and the substitution's closing
    // backtick is misread as opening a new, unterminated template literal that swallows every
    // subsequent token (including comments) until some later, unrelated backtick closes it. This
    // reproduces that shape: a real interpolation, followed by a comment containing a backtick of
    // its own, followed by a genuine suppression that must still be found.
    const text = [
      "const label = `@ts-${sentinel}`",
      "// an unrelated comment mentioning `sentinel` in backticks",
      "// eslint-disable-next-line no-console",
      "console.log(label)",
    ].join("\n")

    const found = discoverSuppressionsInFile("src/x.ts", text)
    expect(found).toEqual([
      {
        file: "src/x.ts",
        line: 3,
        domain: "eslint",
        rule: ["no-console"],
        content: "eslint-disable-next-line no-console",
        reason: "",
      },
    ])
  })

  it("uses the JSX language variant for .tsx files without erroring", () => {
    const text = ["const El = () => <div />", "// eslint-disable-next-line no-console", "x()"].join(
      "\n",
    )

    expect(discoverSuppressionsInFile("src/x.tsx", text)).toHaveLength(1)
  })
})

describe("discoverSuppressions", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-discover-suppressions-"))
  })

  afterEach(async () => {
    await removeTempDir(root)
  })

  it("reads and scans every given file, resolved against root, in order", async () => {
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(
      path.join(root, "src", "a.ts"),
      "// eslint-disable-next-line no-console",
      "utf8",
    )
    await writeFile(path.join(root, "src", "b.ts"), "// @ts-ignore", "utf8")

    const found = await discoverSuppressions(root, ["src/a.ts", "src/b.ts"])

    expect(found.map((f) => f.file)).toEqual(["src/a.ts", "src/b.ts"])
    expect(found.map((f) => f.domain)).toEqual(["eslint", "typescript"])
  })
})
