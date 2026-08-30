import { Excerpt, ExcerptToken, ExcerptTokenKind } from "@microsoft/api-extractor-model"
import type { DeclarationReference } from "@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference.js"
import { describe, expect, it } from "vitest"
import { checkAssignability } from "../../../scripts/api-contract/type-assignability.js"
import type {
  AssignabilityContext,
  AssignabilityDirection,
} from "../../../scripts/api-contract/type-assignability.js"

/**
 * Real `ts.Program` probes over hand-built `Excerpt`/`ExcerptToken` objects and inline `.d.ts`
 * strings -- no fixtures, no mocking of the TypeScript compiler or API Extractor model classes.
 * Exercises the reconstruction-plus-real-compiler design against the full breadth of TypeScript's
 * type language, per the review's explicit "prove it, don't assert it" requirement.
 */

function contentToken(text: string): ExcerptToken {
  return new ExcerptToken(ExcerptTokenKind.Content, text)
}

function referenceToken(
  text: string,
  canonicalReference: DeclarationReference | undefined,
): ExcerptToken {
  return new ExcerptToken(ExcerptTokenKind.Reference, text, canonicalReference)
}

function excerptOf(tokens: readonly ExcerptToken[]): Excerpt {
  return new Excerpt(tokens, { startIndex: 0, endIndex: tokens.length })
}

function fakeReference(id: string): DeclarationReference {
  return { toString: () => id } as unknown as DeclarationReference
}

function check(
  oldTokens: readonly ExcerptToken[],
  newTokens: readonly ExcerptToken[],
  direction: AssignabilityDirection,
  overrides: Partial<AssignabilityContext> = {},
) {
  const context: AssignabilityContext = {
    baselineDts: "export {};\n",
    currentDts: "export {};\n",
    baselineRefIndex: new Map(),
    currentRefIndex: new Map(),
    oldExcerpt: excerptOf(oldTokens),
    newExcerpt: excerptOf(newTokens),
    freeTypeParameterNames: new Set(),
    ...overrides,
  }
  return checkAssignability(context, direction)
}

describe("checkAssignability -- primitives and directions", () => {
  it("contravariant: widening a parameter type (string -> string|number) is compatible", () => {
    expect(
      check([contentToken("string")], [contentToken("string | number")], "contravariant"),
    ).toBe("compatible")
  })

  it("contravariant: narrowing a parameter type (string|number -> string) is breaking", () => {
    expect(
      check([contentToken("string | number")], [contentToken("string")], "contravariant"),
    ).toBe("breaking")
  })

  it("covariant: narrowing a return type (string|number -> string) is compatible", () => {
    expect(check([contentToken("string | number")], [contentToken("string")], "covariant")).toBe(
      "compatible",
    )
  })

  it("covariant: widening a return type (string -> string|number) is breaking", () => {
    expect(check([contentToken("string")], [contentToken("string | number")], "covariant")).toBe(
      "breaking",
    )
  })

  it("invariant: a mutable property type change requires assignability in both directions", () => {
    expect(check([contentToken("string")], [contentToken("string | number")], "invariant")).toBe(
      "breaking",
    )
    expect(check([contentToken("1")], [contentToken("1")], "invariant")).toBe("compatible")
  })
})

describe("checkAssignability -- conservative fallbacks", () => {
  it("forces unknown when a free type-parameter name appears in either excerpt, rather than unsoundly instantiating", () => {
    const result = check([contentToken("T")], [contentToken("T | string")], "contravariant", {
      freeTypeParameterNames: new Set(["T"]),
    })
    expect(result).toBe("unknown")
  })

  it("does not false-positive on an unrelated identifier that merely contains the type-parameter name as a substring", () => {
    // "Array" must be a whole-word match against a real, resolvable ambient global --
    // "ArrayBuffer" must not trigger the free-type-parameter fallback for a type parameter "Array".
    const result = check(
      [contentToken("ArrayBuffer")],
      [contentToken("ArrayBuffer")],
      "invariant",
      {
        freeTypeParameterNames: new Set(["Array"]),
      },
    )
    expect(result).toBe("compatible")
  })

  it("forces unknown when a reference token has no canonicalReference at all (unresolvable)", () => {
    const result = check(
      [referenceToken("SomeExternalType", undefined)],
      [referenceToken("SomeExternalType", undefined)],
      "invariant",
    )
    expect(result).toBe("unknown")
  })

  it("forces unknown when a reference token's canonicalReference isn't present in the ref index (external package or release-tag-trimmed)", () => {
    const result = check(
      [referenceToken("Foo", fakeReference("ref-not-in-index"))],
      [referenceToken("Foo", fakeReference("ref-not-in-index"))],
      "invariant",
      { baselineRefIndex: new Map(), currentRefIndex: new Map() },
    )
    expect(result).toBe("unknown")
  })

  it("forces unknown for a bare `this` position -- correctly falls back rather than producing a false result", () => {
    const result = check([contentToken("this")], [contentToken("this")], "invariant")
    expect(result).toBe("unknown")
  })
})

describe("checkAssignability -- resolves real named references via the ref index", () => {
  it("resolves a plain named-type reference, including through a renamed export on one side", () => {
    const baselineDts = "export interface Foo {\n  readonly value: string;\n}\n"
    const currentDts = "export interface Bar {\n  readonly value: string;\n}\n"
    const result = check(
      [referenceToken("Foo", fakeReference("ref-foo"))],
      [referenceToken("Bar", fakeReference("ref-foo"))],
      "invariant",
      {
        baselineDts,
        currentDts,
        baselineRefIndex: new Map([["ref-foo", "Foo"]]),
        currentRefIndex: new Map([["ref-foo", "Bar"]]),
      },
    )
    expect(result).toBe("compatible")
  })

  it("classifies a structurally incompatible renamed reference as breaking", () => {
    const baselineDts = "export interface Foo {\n  readonly value: string;\n}\n"
    const currentDts =
      "export interface Bar {\n  readonly value: string;\n  readonly extra: number;\n}\n"
    // covariant: is the new type assignable to the old one? Bar has an extra required member beyond
    // what Foo declares, but structurally still satisfies Foo (excess properties are fine for a
    // non-literal assignment) -- use the reverse direction instead, where Foo (missing `extra`) is
    // NOT assignable to Bar.
    const result = check(
      [referenceToken("Foo", fakeReference("ref-foo"))],
      [referenceToken("Bar", fakeReference("ref-foo"))],
      "contravariant",
      {
        baselineDts,
        currentDts,
        baselineRefIndex: new Map([["ref-foo", "Foo"]]),
        currentRefIndex: new Map([["ref-foo", "Bar"]]),
      },
    )
    expect(result).toBe("breaking")
  })

  it("resolves a self-referential (recursive) named type correctly", () => {
    const dts = "export interface Node {\n  readonly value: number;\n  readonly next?: Node;\n}\n"
    const result = check(
      [referenceToken("Node", fakeReference("ref-node"))],
      [referenceToken("Node", fakeReference("ref-node"))],
      "invariant",
      {
        baselineDts: dts,
        currentDts: dts,
        baselineRefIndex: new Map([["ref-node", "Node"]]),
        currentRefIndex: new Map([["ref-node", "Node"]]),
      },
    )
    expect(result).toBe("compatible")
  })
})

describe("checkAssignability -- the real compiler understands the full type language once reconstructed", () => {
  it("unions and intersections", () => {
    expect(
      check(
        [contentToken("{ a: string } & { b: number }")],
        [contentToken("{ a: string; b: number }")],
        "invariant",
      ),
    ).toBe("compatible")
  })

  it("an ambient/external global type used as plain content text (e.g. Promise<T>)", () => {
    expect(
      check([contentToken("Promise<string>")], [contentToken("Promise<string>")], "invariant"),
    ).toBe("compatible")
    expect(
      check([contentToken("Promise<string>")], [contentToken("Promise<number>")], "invariant"),
    ).toBe("breaking")
  })

  it("a conditional type is evaluated by the real compiler", () => {
    const result = check(
      [contentToken('(string extends string ? "yes" : "no")')],
      [contentToken('"yes"')],
      "invariant",
    )
    expect(result).toBe("compatible")
  })

  it("a mapped type is evaluated structurally", () => {
    // Old ({a}) assignable to New ({a,b}) is false -- Old lacks the `b` member New requires.
    const result = check(
      [contentToken('{ [K in "a"]: number }')],
      [contentToken('{ [K in "a" | "b"]: number }')],
      "contravariant",
    )
    expect(result).toBe("breaking")
  })

  it("an indexed-access type is resolved", () => {
    const result = check(
      [contentToken('{ a: string }["a"]')],
      [contentToken("string")],
      "invariant",
    )
    expect(result).toBe("compatible")
  })

  it("a function type nested in the position is checked with its own internal (contravariant-on-parameters) variance", () => {
    // A function accepting the wider `string | number` is substitutable wherever one accepting
    // only `string` is expected (old=wide assignable to new=narrow); the reverse is not sound (the
    // narrower function can't handle a number the wider one's callers might pass) -- exercised here
    // via a single directional ("contravariant") check each way, not "invariant" (which requires
    // both directions to hold, which a genuine widening/narrowing pair never does).
    expect(
      check(
        [contentToken("(x: string | number) => void")],
        [contentToken("(x: string) => void")],
        "contravariant",
      ),
    ).toBe("compatible")
    expect(
      check(
        [contentToken("(x: string) => void")],
        [contentToken("(x: string | number) => void")],
        "contravariant",
      ),
    ).toBe("breaking")
  })

  it("keyof is evaluated by the real compiler", () => {
    const result = check(
      [contentToken("keyof { a: string; b: number }")],
      [contentToken("keyof { a: string }")],
      "contravariant",
    )
    // Old (`"a"|"b"`) assignable to New (`"a"`) is false -- "b" is not part of "a".
    expect(result).toBe("breaking")
  })

  it("typeof is evaluated against an ambient global", () => {
    expect(check([contentToken("typeof Array")], [contentToken("typeof Array")], "invariant")).toBe(
      "compatible",
    )
  })

  it("infer inside a conditional type is evaluated by the real compiler", () => {
    const result = check(
      [contentToken("(string[] extends (infer U)[] ? U : never)")],
      [contentToken("string")],
      "invariant",
    )
    expect(result).toBe("compatible")
  })
})
