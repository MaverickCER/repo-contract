import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { NormalizedMember } from "../../../scripts/api-contract/model-normalizer.js"
import { normalizeApiPackage } from "../../../scripts/api-contract/model-normalizer.js"
import { buildFixturePackage } from "../../helpers/api-contract/build-fixture-package.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"

/**
 * Real `Extractor.invoke()` over a real, compiled fixture package -- asserted against real
 * `ApiItem` subclasses via `normalizeApiPackage`, never assumptions about `.api.json`'s raw shape.
 * This is the single highest-risk file in the whole feature; these tests exist specifically to
 * prove the normalization is correct against the actually-installed API Extractor model, not just
 * type-check against it.
 */

const FIXTURE_SOURCE = `
/**
 * @public
 */
export interface Base {
  readonly id: string
}

/**
 * @public
 */
export interface Widget extends Base {
  name: string
  size?: number
}

/**
 * @public
 */
export class Box<T> implements Widget {
  readonly id: string = "box"
  name = "box"
  size?: number

  constructor(public value: T) {}

  /** @internal */
  _private(): void {}

  getValue(overloadA: string): string
  getValue(overloadA: number): number
  getValue(overloadA: string | number): string | number {
    return overloadA
  }
}

/**
 * @public
 */
export function createBox<T>(value: T): Box<T> {
  return new Box(value)
}

/**
 * @public
 */
export enum Level {
  Low = 1,
  High = 2,
}

/**
 * @beta
 */
export function experimental(): void {}

/**
 * @public
 */
export type Shape = "circle" | "square"
`

let root: string
let normalizedPublic: ReadonlyMap<string, NormalizedMember>
let normalizedBeta: ReadonlyMap<string, NormalizedMember>

function findByScopedName(
  map: ReadonlyMap<string, NormalizedMember>,
  scopedName: string,
): NormalizedMember | undefined {
  return [...map.values()].find((m) => m.scopedName === scopedName)
}

/** For function/method kinds, `getScopedNameWithinPackage()` includes a parenthesized parameter list to disambiguate overloads (e.g. "createBox()", "Box.getValue(overloadA)") -- `.name` is the bare identifier, unaffected by that. */
function findByName(
  map: ReadonlyMap<string, NormalizedMember>,
  name: string,
): NormalizedMember | undefined {
  return [...map.values()].find((m) => m.name === name)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-model-normalizer-"))
  const fixture = await buildFixturePackage(root, FIXTURE_SOURCE)
  normalizedPublic = normalizeApiPackage(fixture.pkg, "public")
  normalizedBeta = normalizeApiPackage(fixture.pkg, "beta")
}, 30_000)

afterEach(async () => {
  await removeTempDir(root)
})

describe("normalizeApiPackage", () => {
  it("includes @public top-level exports and excludes @internal members, at the default (public) threshold", () => {
    expect(findByScopedName(normalizedPublic, "Box")).toBeDefined()
    expect(findByName(normalizedPublic, "createBox")).toBeDefined()
    expect(findByName(normalizedPublic, "_private")).toBeUndefined()
  })

  it("excludes @beta items at the public threshold, but includes them at the beta threshold", () => {
    expect(findByName(normalizedPublic, "experimental")).toBeUndefined()
    expect(findByName(normalizedBeta, "experimental")).toBeDefined()
    expect(findByName(normalizedBeta, "experimental")?.releaseTag).toBe("beta")
  })

  it("marks a top-level export as isTopLevelExport, and a nested class member as not", () => {
    expect(findByScopedName(normalizedPublic, "Box")?.isTopLevelExport).toBe(true)
    expect(findByScopedName(normalizedPublic, "Box.name")?.isTopLevelExport).toBe(false)
  })

  it("resolves fileUrlPath for a nested member from its parent, since upstream leaves it undefined when it matches the parent's", () => {
    const box = findByScopedName(normalizedPublic, "Box")
    expect(box?.fileUrlPath).toBeDefined()

    // `Box.name` is declared in the same file as `Box` itself -- exactly the case upstream
    // `ApiDeclaredItem.fileUrlPath` leaves undefined ("is undefined if the path is the same as
    // the parent API item's"), which resolveFileUrlPath must walk up through to find.
    const boxName = findByScopedName(normalizedPublic, "Box.name")
    expect(boxName?.fileUrlPath).toBe(box?.fileUrlPath)
  })

  it("captures interface extends/class implements as heritage excerpt text", () => {
    const widget = findByScopedName(normalizedPublic, "Widget")
    expect(widget?.extendsExcerptTexts).toEqual(["Base"])

    const box = findByScopedName(normalizedPublic, "Box")
    expect(box?.implementsExcerptTexts).toEqual(["Widget"])
  })

  it("captures property optional/readonly flags and type excerpt text", () => {
    const size = findByScopedName(normalizedPublic, "Box.size")
    expect(size?.isOptional).toBe(true)
    expect(size?.propertyTypeExcerptText).toBe("number")

    const id = findByScopedName(normalizedPublic, "Box.id")
    expect(id?.isReadonly).toBe(true)
  })

  it("captures function/method parameters and return type", () => {
    const createBox = findByName(normalizedPublic, "createBox")
    expect(createBox?.parameters).toEqual([
      { name: "value", isOptional: false, typeExcerptText: "T" },
    ])
    expect(createBox?.returnTypeExcerptText).toBe("Box<T>")
  })

  it("captures type-parameter names", () => {
    expect(findByScopedName(normalizedPublic, "Box")?.typeParameterNames).toEqual(["T"])
    expect(findByName(normalizedPublic, "createBox")?.typeParameterNames).toEqual(["T"])
  })

  it("captures each overload as its own member with its own overloadIndex", () => {
    const overloads = [...normalizedPublic.values()].filter(
      (m) => m.name === "getValue" && m.kind === "Method",
    )
    expect(overloads).toHaveLength(2)
    expect(overloads.map((o) => o.overloadIndex).sort()).toEqual([1, 2])
  })

  it("captures enum members with their initializer excerpt text", () => {
    const low = findByScopedName(normalizedPublic, "Level.Low")
    expect(low?.kind).toBe("EnumMember")
    expect(low?.initializerExcerptText).toBe("1")
  })

  it("captures a type alias's excerpt text", () => {
    const shape = findByScopedName(normalizedPublic, "Shape")
    expect(shape?.typeAliasExcerptText).toBe('"circle" | "square"')
  })

  it("is unaffected by documentation-only or implementation-only changes -- normalization has no field for either", () => {
    const box = findByScopedName(normalizedPublic, "Box")
    expect(box).not.toHaveProperty("docComment")
    expect(box).not.toHaveProperty("sourceLocation")
    expect(box).not.toHaveProperty("fileLine")
  })
})

describe("normalizeApiPackage -- release-tag threshold parameter", () => {
  it("is passed in, not hardcoded -- alpha threshold admits alpha/beta/public, none below", async () => {
    const alphaRoot = await mkdtemp(path.join(os.tmpdir(), "repo-contract-model-normalizer-alpha-"))
    try {
      const source = `
/** @alpha */
export function alphaOnly(): void {}

/** @internal */
export function internalOnly(): void {}
`
      const fixture = await buildFixturePackage(alphaRoot, source)
      const normalized = normalizeApiPackage(fixture.pkg, "alpha")
      expect(findByName(normalized, "alphaOnly")).toBeDefined()
      expect(findByName(normalized, "internalOnly")).toBeUndefined()
    } finally {
      await removeTempDir(alphaRoot)
    }
  }, 30_000)
})
