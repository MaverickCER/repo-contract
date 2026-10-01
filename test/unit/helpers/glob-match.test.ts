import { describe, expect, it } from "vitest"
import { globMatch } from "../../../src/helpers/glob-match.js"

describe("globMatch", () => {
  it("matches a literal pattern exactly and nothing else", () => {
    expect(globMatch("rule-a", "rule-a")).toBe(true)
    expect(globMatch("rule-ab", "rule-a")).toBe(false)
    expect(globMatch("xrule-a", "rule-a")).toBe(false)
  })

  it("treats regex metacharacters in a pattern literally", () => {
    expect(globMatch("a.b", "a.b")).toBe(true)
    expect(globMatch("axb", "a.b")).toBe(false)
    expect(globMatch("a+b", "a+b")).toBe(true)
    expect(globMatch("a(b)", "a(b)")).toBe(true)
    expect(globMatch("a|b", "a|b")).toBe(true)
    expect(globMatch("a^b$", "a^b$")).toBe(true)
    expect(globMatch("a-b", "a-b")).toBe(true)
    expect(globMatch("a]b", "a]b")).toBe(true)
    expect(globMatch("a\\b", "a\\")).toBe(false)
  })

  it("`*` matches within one segment only", () => {
    expect(globMatch("security/x", "security/*")).toBe(true)
    expect(globMatch("security/", "security/*")).toBe(true)
    expect(globMatch("security/x/y", "security/*")).toBe(false)
    expect(globMatch("other/x", "security/*")).toBe(false)
    expect(globMatch("abc", "a*c")).toBe(true)
    expect(globMatch("a/c", "a*c")).toBe(false)
  })

  it("`**` matches across segments", () => {
    expect(globMatch("security/x/y", "security/**")).toBe(true)
    expect(globMatch("security/", "security/**")).toBe(true)
    expect(globMatch("security", "security/**")).toBe(false)
    expect(globMatch("a/b", "a**b")).toBe(true)
    expect(globMatch("a/x/b", "a**b")).toBe(true)
  })

  it("a whole `**/` segment also matches zero segments", () => {
    expect(globMatch("b", "**/b")).toBe(true)
    expect(globMatch("a/b", "**/b")).toBe(true)
    expect(globMatch("a/c/b", "**/b")).toBe(true)
    expect(globMatch("a/bc", "**/b")).toBe(false)
  })

  it("`?` matches exactly one non-slash character", () => {
    expect(globMatch("a.b", "a?b")).toBe(true)
    expect(globMatch("ab", "a?b")).toBe(false)
    expect(globMatch("a/b", "a?b")).toBe(false)
  })

  it("supports character classes, ranges and both negation markers", () => {
    expect(globMatch("b", "[a-c]")).toBe(true)
    expect(globMatch("d", "[a-c]")).toBe(false)
    expect(globMatch("d", "[!a-c]")).toBe(true)
    expect(globMatch("a", "[!a-c]")).toBe(false)
    expect(globMatch("d", "[^a-c]")).toBe(true)
    expect(globMatch("b", "[^a-c]")).toBe(false)
    expect(globMatch("\\", "[\\]")).toBe(true)
  })

  it("class ranges include both ends and exclude everything outside them", () => {
    for (const [value, expected] of [
      ["a", false],
      ["b", true],
      ["c", true],
      ["d", true],
      ["e", false],
    ] as const) {
      expect(globMatch(value, "[b-d]")).toBe(expected)
    }
    expect(globMatch("b", "[ace]")).toBe(false)
    expect(globMatch("d", "[ace]")).toBe(false)
    expect(globMatch("c", "[ace]")).toBe(true)
    expect(globMatch("a", "[a-]")).toBe(true)
    expect(globMatch("b", "[a-ce]")).toBe(true)
    expect(globMatch("d", "[a-ce]")).toBe(false)
    expect(globMatch("e", "[a-ce]")).toBe(true)
  })

  it("a negation marker is only stripped from the class, never matched literally", () => {
    expect(globMatch("!", "[!a]")).toBe(true)
    expect(globMatch("a", "[!a]")).toBe(false)
    expect(globMatch("^", "[^a]")).toBe(true)
    expect(globMatch("^", "[a^]")).toBe(true)
    expect(globMatch("!", "[a!]")).toBe(true)
  })

  it("only brace groups with a comma and no braces of their own expand", () => {
    expect(globMatch("a,b}", "a,b}")).toBe(true)
    expect(globMatch("a", "a,b}")).toBe(false)
    expect(globMatch("a{c", "{a,b}{c")).toBe(true)
    expect(globMatch("b{c", "{a,b}{c")).toBe(true)
    expect(globMatch("{a,b}{c", "{a,b}{c")).toBe(false)
    expect(globMatch("x}", "{x}}")).toBe(false)
    expect(globMatch("{x}}", "{x}}")).toBe(true)
  })

  it("expansion yields only the pattern's own alternatives", () => {
    expect(globMatch("Stryker was here", "x")).toBe(false)
    expect(globMatch("Stryker was here", "{a,b}")).toBe(false)
  })

  it("an empty value and an empty pattern match each other only", () => {
    expect(globMatch("", "")).toBe(true)
    expect(globMatch("", "*")).toBe(true)
    expect(globMatch("", "**")).toBe(true)
    expect(globMatch("", "**/")).toBe(true)
    expect(globMatch("", "?")).toBe(false)
    expect(globMatch("", "[a]")).toBe(false)
    expect(globMatch("", "a")).toBe(false)
    expect(globMatch("a", "")).toBe(false)
  })

  it("`**/` matches exactly zero or more whole segments, never a partial one", () => {
    expect(globMatch("x/y", "**/y")).toBe(true)
    expect(globMatch("x/y/z", "**/y/z")).toBe(true)
    expect(globMatch("xy", "**/y")).toBe(false)
    expect(globMatch("/y", "**/y")).toBe(true)
    expect(globMatch("a/", "a/**/")).toBe(true)
    expect(globMatch("a/b/", "a/**/")).toBe(true)
    expect(globMatch("ab/", "a/**/")).toBe(false)
  })

  it("`*` and `?` and classes never cross a slash, `**` does", () => {
    expect(globMatch("a/b", "a*b")).toBe(false)
    expect(globMatch("a/b", "a?b")).toBe(false)
    expect(globMatch("a/b", "a[/]b")).toBe(false)
    expect(globMatch("a/b", "a[!x]b")).toBe(false)
    expect(globMatch("a/b", "a**b")).toBe(true)
    expect(globMatch("ab", "a*")).toBe(true)
    expect(globMatch("a/b", "a*")).toBe(false)
  })

  it("a dash is a literal only when it is not between two characters", () => {
    expect(globMatch("-", "[a-c]")).toBe(false)
    expect(globMatch("-", "[a-]")).toBe(true)
    expect(globMatch("-", "[-c]")).toBe(true)
    expect(globMatch("b", "[-c]")).toBe(false)
    expect(globMatch("c", "[a-c-e]")).toBe(true)
    expect(globMatch("d", "[a-c-e]")).toBe(false)
    expect(globMatch("e", "[a-c-e]")).toBe(true)
    expect(globMatch("-", "[a-c-e]")).toBe(true)
  })

  it("every token consumes exactly what it should -- never backward, never beyond", () => {
    expect(globMatch("ab", "ab*b")).toBe(false)
    expect(globMatch("ab", "ab**b")).toBe(false)
    expect(globMatch("ab", "ab**/b")).toBe(false)
    expect(globMatch("a/b", "a/b**/b")).toBe(false)
    expect(globMatch("ab", "a?b?")).toBe(false)
    expect(globMatch("ab", "?")).toBe(false)
    expect(globMatch("ab", "[ab]")).toBe(false)
    expect(globMatch("ab", "a")).toBe(false)
    expect(globMatch("aa", "a")).toBe(false)
    expect(globMatch("b", "a?")).toBe(false)
    expect(globMatch("ab", "ab?")).toBe(false)
    expect(globMatch("ab", "ab[a-z]")).toBe(false)
    expect(globMatch("abb", "ab*b")).toBe(true)
    expect(globMatch("ab", "ab*")).toBe(true)
    expect(globMatch("ab", "ab**")).toBe(true)
  })

  it("a reversed range matches nothing and a lone dash is literal", () => {
    expect(globMatch("m", "[z-a]")).toBe(false)
    expect(globMatch("-", "[a-]")).toBe(true)
    expect(globMatch("b", "[a-]")).toBe(false)
    expect(globMatch("-", "[-a]")).toBe(true)
    expect(globMatch("a", "[a-a]")).toBe(true)
    expect(globMatch("/", "[a/b]")).toBe(false)
  })

  it("throws when brace groups would expand to too many alternatives", () => {
    const explosive = "{a,b}".repeat(11)
    expect(() => globMatch("x", explosive)).toThrow("expands to too many brace alternatives")
    expect(globMatch("a".repeat(9), "{a,b}".repeat(9))).toBe(true)
  })

  it("rejects a pattern over 1000 characters, accepts exactly 1000 (it just does not match)", () => {
    expect(globMatch("a", "a".repeat(1000))).toBe(false)
    expect(() => globMatch("a", "a".repeat(1001))).toThrow(
      "Glob pattern is longer than 1000 characters.",
    )
  })

  it("does not backtrack catastrophically", () => {
    const value = "a".repeat(150)
    expect(globMatch(`${value}b`, "*".repeat(30) + "c")).toBe(false)
    expect(globMatch(value, "a*".repeat(40) + "b")).toBe(false)
  })

  it("supports brace alternation, including nested and multiple groups", () => {
    expect(globMatch("x", "{x,y}")).toBe(true)
    expect(globMatch("y", "{x,y}")).toBe(true)
    expect(globMatch("z", "{x,y}")).toBe(false)
    expect(globMatch("a-1-c", "a-{1,2}-{c,d}")).toBe(true)
    expect(globMatch("a-2-d", "a-{1,2}-{c,d}")).toBe(true)
    expect(globMatch("a-3-c", "a-{1,2}-{c,d}")).toBe(false)
    expect(globMatch("ab", "a{b,{c,d}}")).toBe(true)
    expect(globMatch("ad", "a{b,{c,d}}")).toBe(true)
    expect(globMatch("ae", "a{b,{c,d}}")).toBe(false)
    expect(globMatch("a", "a{,b}")).toBe(true)
    expect(globMatch("ab", "a{,b}")).toBe(true)
  })

  it("keeps a brace group with no comma literal", () => {
    expect(globMatch("{x}", "{x}")).toBe(true)
    expect(globMatch("x", "{x}")).toBe(false)
    expect(globMatch("a{b", "a{b")).toBe(true)
  })

  it("a backslash escapes the next character", () => {
    expect(globMatch("*", "\\*")).toBe(true)
    expect(globMatch("x", "\\*")).toBe(false)
    expect(globMatch("a?b", "a\\?b")).toBe(true)
    expect(globMatch("\\", "\\")).toBe(true)
  })

  it("matches the whole value, not a substring", () => {
    expect(globMatch("xa", "a")).toBe(false)
    expect(globMatch("ax", "a")).toBe(false)
    expect(globMatch("ax", "a{,x}")).toBe(true)
    expect(globMatch("xa", "a|x")).toBe(false)
  })
})
