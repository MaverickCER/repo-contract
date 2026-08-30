import { describe, expect, it } from "vitest"
import { canonicalizeComment } from "../../../scripts/suppression-governance/canonicalize-comment.js"

describe("canonicalizeComment", () => {
  it("strips a single-line comment's // prefix and surrounding whitespace", () => {
    const raw = "// eslint-disable-next-line security/detect-object-injection"
    expect(canonicalizeComment(raw, "single")).toBe(
      "eslint-disable-next-line security/detect-object-injection",
    )
  })

  it("collapses a multiline block directive to one line, byte-identical to its single-line form", () => {
    const multiLine = [
      "/* eslint-disable security/detect-object-injection",
      " * security/detect-unsafe-regex",
      " */",
    ].join("\n")
    const oneLine =
      "/* eslint-disable security/detect-object-injection security/detect-unsafe-regex */"

    const canonical = "eslint-disable security/detect-object-injection security/detect-unsafe-regex"
    expect(canonicalizeComment(multiLine, "multi")).toBe(canonical)
    // The equivalence that stops a wrap/unwrap reformat from being seen as a
    // removed suppression plus a new one.
    expect(canonicalizeComment(oneLine, "multi")).toBe(canonical)
  })

  it("canonicalizes a single-line block comment identically to a real single-line comment", () => {
    expect(canonicalizeComment("/* @ts-expect-error reason */", "multi")).toBe(
      "@ts-expect-error reason",
    )
  })

  it("produces identical output for decoration-only formatting changes (re-indentation, alignment stars)", () => {
    const compact = "/* eslint-disable no-console */"
    const expanded = ["/* eslint-disable no-console", " *", " */"].join("\n")

    // The trailing "*" line carries no semantic content -- it's decoration only.
    expect(canonicalizeComment(expanded, "multi")).toBe(canonicalizeComment(compact, "multi"))
    expect(canonicalizeComment(compact, "multi")).toBe("eslint-disable no-console")
  })

  it("produces identical output regardless of extra indentation on continuation lines", () => {
    const tight = ["/* eslint-disable no-console,", " * no-alert", " */"].join("\n")
    const loose = ["/*   eslint-disable no-console,", "     *     no-alert", "   */"].join("\n")

    expect(canonicalizeComment(tight, "multi")).toBe(canonicalizeComment(loose, "multi"))
  })
})
