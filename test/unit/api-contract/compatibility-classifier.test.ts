import { describe, expect, it } from "vitest"
import { classifyContractChanges } from "../../../scripts/api-contract/compatibility-classifier.js"
import type {
  AssignabilityQuery,
  ResolveAssignability,
} from "../../../scripts/api-contract/compatibility-classifier.js"
import type { NormalizedMember } from "../../../scripts/api-contract/model-normalizer.js"

/**
 * Synthetic `NormalizedMember` maps and a fake `resolveAssignability` -- fast, deterministic unit
 * tests with no TypeScript/API Extractor dependency, per the check/policy testing split.
 */

function member(
  overrides: Partial<NormalizedMember> & { canonicalReference: string },
): NormalizedMember {
  return {
    scopedName: overrides.canonicalReference,
    kind: "Function",
    isTopLevelExport: true,
    releaseTag: "public",
    isDeprecated: false,
    ...overrides,
  }
}

const alwaysCompatible: ResolveAssignability = () => "compatible"
const alwaysBreaking: ResolveAssignability = () => "breaking"
const alwaysUnknown: ResolveAssignability = () => "unknown"

function classify(
  baseline: readonly NormalizedMember[],
  current: readonly NormalizedMember[],
  resolveAssignability: ResolveAssignability = alwaysCompatible,
) {
  const baselineMap = new Map(baseline.map((m) => [m.canonicalReference, m]))
  const currentMap = new Map(current.map((m) => [m.canonicalReference, m]))
  return classifyContractChanges(baselineMap, currentMap, { resolveAssignability })
}

describe("classifyContractChanges", () => {
  it("reports an identical contract as unchanged with no diff", () => {
    const m = member({ canonicalReference: "!pkg#getUsers:function" })
    const { changes, impact } = classify([m], [m])
    expect(changes).toEqual([])
    expect(impact).toBe("unchanged")
  })

  it("classifies an added top-level export as compatible", () => {
    const added = member({ canonicalReference: "!pkg#getUsers:function" })
    const { changes, impact } = classify([], [added])
    expect(impact).toBe("compatible")
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: "export-added", compatibility: "compatible" })
  })

  it("classifies a removed top-level export as breaking", () => {
    const removed = member({ canonicalReference: "!pkg#getUserByEmail:function" })
    const { changes, impact } = classify([removed], [])
    expect(impact).toBe("breaking")
    expect(changes[0]).toMatchObject({ kind: "export-removed", compatibility: "breaking" })
  })

  it("classifies an added required parameter as breaking, an added optional parameter as compatible", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      parameters: [{ name: "id", isOptional: false, typeExcerptText: "string" }],
    })
    const withRequired = member({
      ...base,
      canonicalReference: base.canonicalReference,
      parameters: [
        { name: "id", isOptional: false, typeExcerptText: "string" },
        { name: "opts", isOptional: false, typeExcerptText: "object" },
      ],
    })
    const withOptional = member({
      ...base,
      canonicalReference: base.canonicalReference,
      parameters: [
        { name: "id", isOptional: false, typeExcerptText: "string" },
        { name: "opts", isOptional: true, typeExcerptText: "object" },
      ],
    })

    expect(classify([base], [withRequired]).changes[0]).toMatchObject({
      kind: "parameter-added",
      compatibility: "breaking",
    })
    expect(classify([base], [withOptional]).changes[0]).toMatchObject({
      kind: "parameter-added",
      compatibility: "compatible",
    })
  })

  it("classifies a removed parameter as breaking", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      parameters: [
        { name: "id", isOptional: false, typeExcerptText: "string" },
        { name: "opts", isOptional: true, typeExcerptText: "object" },
      ],
    })
    const removed = member({
      ...base,
      parameters: [{ name: "id", isOptional: false, typeExcerptText: "string" }],
    })
    const { changes } = classify([base], [removed])
    expect(changes[0]).toMatchObject({ kind: "parameter-removed", compatibility: "breaking" })
  })

  it("delegates a parameter type change to resolveAssignability with contravariant direction", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      parameters: [{ name: "id", isOptional: false, typeExcerptText: "string" }],
    })
    const changed = member({
      ...base,
      parameters: [{ name: "id", isOptional: false, typeExcerptText: "string | number" }],
    })

    let seenDirection: AssignabilityQuery["direction"] | undefined
    let seenPosition: AssignabilityQuery["position"] | undefined
    const resolver: ResolveAssignability = (query) => {
      seenDirection = query.direction
      seenPosition = query.position
      return "compatible"
    }

    const { changes } = classify([base], [changed], resolver)
    expect(seenDirection).toBe("contravariant")
    expect(seenPosition).toBe("parameter")
    expect(changes[0]).toMatchObject({
      kind: "parameter-type-changed",
      compatibility: "compatible",
    })
  })

  it("classifies return-type widening as breaking and narrowing as compatible, via covariant resolution", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      returnTypeExcerptText: "string",
    })
    const widened = member({ ...base, returnTypeExcerptText: "string | number" })
    const narrowed = member({
      canonicalReference: "!pkg#other:function",
      returnTypeExcerptText: "string",
    })
    const baseOther = member({
      canonicalReference: "!pkg#other:function",
      returnTypeExcerptText: "string | number",
    })

    let seenDirection: AssignabilityQuery["direction"] | undefined
    const resolver: ResolveAssignability = (query) => {
      seenDirection = query.direction
      // Simulate real TypeChecker semantics for these specific examples.
      return query.oldCanonicalReference === base.canonicalReference ? "breaking" : "compatible"
    }

    expect(classify([base], [widened], resolver).changes[0]).toMatchObject({
      kind: "return-type-changed",
      compatibility: "breaking",
    })
    expect(seenDirection).toBe("covariant")
    expect(classify([baseOther], [narrowed], resolver).changes[0]).toMatchObject({
      kind: "return-type-changed",
      compatibility: "compatible",
    })
  })

  it("classifies a required property addition as breaking, an optional one as compatible, and a removal as always breaking", () => {
    const required = member({
      canonicalReference: "!pkg#User.email:member",
      isTopLevelExport: false,
      kind: "PropertySignature",
      isOptional: false,
      isReadonly: false,
      propertyTypeExcerptText: "string",
    })
    const optional = member({ ...required, isOptional: true })

    expect(classify([], [required]).changes[0]).toMatchObject({
      kind: "property-added",
      compatibility: "breaking",
    })
    expect(classify([], [optional]).changes[0]).toMatchObject({
      kind: "property-added",
      compatibility: "compatible",
    })
    expect(classify([required], []).changes[0]).toMatchObject({
      kind: "property-removed",
      compatibility: "breaking",
    })
  })

  it("classifies a readonly-ness change on a property", () => {
    const mutable = member({
      canonicalReference: "!pkg#Config.value:member",
      isTopLevelExport: false,
      kind: "PropertySignature",
      isOptional: false,
      isReadonly: false,
      propertyTypeExcerptText: "string",
    })
    const readonly = member({ ...mutable, isReadonly: true })

    expect(classify([mutable], [readonly]).changes[0]).toMatchObject({
      kind: "property-readonly-changed",
      compatibility: "compatible",
    })
    expect(classify([readonly], [mutable]).changes[0]).toMatchObject({
      kind: "property-readonly-changed",
      compatibility: "breaking",
    })
  })

  it("delegates a mutable property type change with invariant direction, a readonly one with covariant", () => {
    const mutableBase = member({
      canonicalReference: "!pkg#Config.value:member",
      isTopLevelExport: false,
      kind: "PropertySignature",
      isOptional: false,
      isReadonly: false,
      propertyTypeExcerptText: "string",
    })
    const mutableChanged = member({ ...mutableBase, propertyTypeExcerptText: "string | number" })
    const readonlyBase = member({ ...mutableBase, isReadonly: true })
    const readonlyChanged = member({ ...readonlyBase, propertyTypeExcerptText: "string | number" })

    const directions: AssignabilityQuery["direction"][] = []
    const resolver: ResolveAssignability = (query) => {
      directions.push(query.direction)
      return "compatible"
    }

    classify([mutableBase], [mutableChanged], resolver)
    classify([readonlyBase], [readonlyChanged], resolver)
    expect(directions).toEqual(["invariant", "covariant"])
  })

  it("classifies generic parameter changes as unknown -- never guessed", () => {
    const base = member({
      canonicalReference: "!pkg#Box:class",
      kind: "Class",
      typeParameterNames: ["T"],
    })
    const changed = member({ ...base, typeParameterNames: ["T", "U"] })
    const { changes, impact } = classify([base], [changed])
    expect(changes[0]).toMatchObject({
      kind: "generic-parameter-changed",
      compatibility: "unknown",
    })
    expect(impact).toBe("unknown")
  })

  it("classifies heritage (extends/implements) changes as unknown -- never guessed", () => {
    const base = member({
      canonicalReference: "!pkg#Widget:class",
      kind: "Class",
      extendsExcerptTexts: ["Base"],
    })
    const changed = member({ ...base, extendsExcerptTexts: ["OtherBase"] })
    const { changes } = classify([base], [changed])
    expect(changes[0]).toMatchObject({ kind: "heritage-changed", compatibility: "unknown" })
  })

  it("classifies a release-tag narrowing as breaking and widening as compatible", () => {
    const base = member({ canonicalReference: "!pkg#thing:function", releaseTag: "public" })
    const narrowed = member({ ...base, releaseTag: "beta" })
    const widened = member({ releaseTag: "beta", canonicalReference: "!pkg#other:function" })
    const rewidened = member({ ...widened, releaseTag: "public" })

    expect(classify([base], [narrowed]).changes[0]).toMatchObject({
      kind: "release-tag-changed",
      compatibility: "breaking",
    })
    expect(classify([widened], [rewidened]).changes[0]).toMatchObject({
      kind: "release-tag-changed",
      compatibility: "compatible",
    })
  })

  it("classifies overload additions/removals by matching within a group by parameter signature, not position", () => {
    const overloadA = member({
      canonicalReference: "!pkg#addVersions:function(1)",
      name: "addVersions",
      overloadIndex: 1,
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "number" }],
      returnTypeExcerptText: "number",
    })
    const overloadB = member({
      canonicalReference: "!pkg#addVersions:function(2)",
      name: "addVersions",
      overloadIndex: 2,
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "string" }],
      returnTypeExcerptText: "string",
    })
    // Simulate inserting a new first overload, which would shift overloadB's canonicalReference to
    // "(3)" under naive positional identity -- signature-text matching should still recognize the
    // string overload as unchanged, and only report the new number|boolean overload as added.
    const overloadC = member({
      canonicalReference: "!pkg#addVersions:function(1)",
      name: "addVersions",
      overloadIndex: 1,
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "boolean" }],
      returnTypeExcerptText: "boolean",
    })
    const overloadBShifted = member({
      ...overloadB,
      canonicalReference: "!pkg#addVersions:function(3)",
    })

    const { changes } = classify([overloadA, overloadB], [overloadC, overloadBShifted])
    expect(changes.map((c) => c.kind).sort()).toEqual(["overload-added", "overload-removed"])
  })

  it("reports a release-tag narrowing on one overload of a multi-overload set (not only return-type changes)", () => {
    const a1 = member({
      canonicalReference: "!pkg#f:function(1)",
      name: "f",
      overloadIndex: 1,
      releaseTag: "public",
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "number" }],
      returnTypeExcerptText: "number",
    })
    const a2 = member({
      canonicalReference: "!pkg#f:function(2)",
      name: "f",
      overloadIndex: 2,
      releaseTag: "public",
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "string" }],
      returnTypeExcerptText: "string",
    })
    const a2narrowed = member({ ...a2, releaseTag: "internal" })

    const { changes } = classify([a1, a2], [a1, a2narrowed])
    expect(changes.map((c) => c.kind)).toContain("release-tag-changed")
  })

  it("reports a brand-new 2-overload function as a single export-added, not two bare overload-added", () => {
    const g1 = member({
      canonicalReference: "!pkg#g:function(1)",
      name: "g",
      overloadIndex: 1,
      isTopLevelExport: true,
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "number" }],
      returnTypeExcerptText: "number",
    })
    const g2 = member({
      canonicalReference: "!pkg#g:function(2)",
      name: "g",
      overloadIndex: 2,
      isTopLevelExport: true,
      parameters: [{ name: "x", isOptional: false, typeExcerptText: "string" }],
      returnTypeExcerptText: "string",
    })
    const { changes } = classify([], [g1, g2])
    expect(changes.map((c) => c.kind)).toEqual(["export-added"])
  })

  it("does not report an unchanged single (non-overloaded) function as an overload add+remove", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      overloadIndex: 1,
      parameters: [{ name: "id", isOptional: false, typeExcerptText: "string" }],
      returnTypeExcerptText: "User",
    })
    const { changes } = classify([base], [base])
    expect(changes).toEqual([])
  })

  it("keeps every change when multiple occur, and a single breaking change dominates the aggregate impact", () => {
    const added = member({ canonicalReference: "!pkg#getUsers:function" })
    const removed = member({ canonicalReference: "!pkg#getUserByEmail:function" })
    const unchanged = member({ canonicalReference: "!pkg#stable:function" })

    const { changes, impact } = classify([removed, unchanged], [added, unchanged])
    expect(changes).toHaveLength(2)
    expect(impact).toBe("breaking")
  })

  it("an unknown change dominates any number of compatible changes, unless something is independently breaking", () => {
    const unknownBase = member({
      canonicalReference: "!pkg#Box:class",
      kind: "Class",
      typeParameterNames: ["T"],
    })
    const unknownChanged = member({ ...unknownBase, typeParameterNames: ["T", "U"] })
    const compatibleAdded1 = member({ canonicalReference: "!pkg#a:function" })
    const compatibleAdded2 = member({ canonicalReference: "!pkg#b:function" })

    const onlyUnknown = classify(
      [unknownBase],
      [unknownChanged, compatibleAdded1, compatibleAdded2],
    )
    expect(onlyUnknown.impact).toBe("unknown")

    const removed = member({ canonicalReference: "!pkg#removed:function" })
    const withBreakingToo = classify([unknownBase, removed], [unknownChanged, compatibleAdded1])
    expect(withBreakingToo.impact).toBe("breaking")
  })

  it("propagates an unresolvable assignability result as an unknown per-change classification", () => {
    const base = member({
      canonicalReference: "!pkg#getUser:function",
      returnTypeExcerptText: "string",
    })
    const changed = member({ ...base, returnTypeExcerptText: "SomeExternalType" })
    const { changes } = classify([base], [changed], alwaysUnknown)
    expect(changes[0]).toMatchObject({ kind: "return-type-changed", compatibility: "unknown" })
  })

  it("produces byte-for-byte-identical output (deterministic) across two independent runs over the same input", () => {
    const removed = member({ canonicalReference: "!pkg#z:function" })
    const added1 = member({ canonicalReference: "!pkg#a:function" })
    const added2 = member({ canonicalReference: "!pkg#m:function" })

    const first = classify([removed], [added1, added2], alwaysBreaking)
    const second = classify([removed], [added1, added2], alwaysBreaking)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it("sorts changes stably by id regardless of input map iteration order", () => {
    const removed = member({ canonicalReference: "!pkg#z:function" })
    const addedA = member({ canonicalReference: "!pkg#a:function" })
    const addedM = member({ canonicalReference: "!pkg#m:function" })

    const { changes } = classify([removed], [addedM, addedA])
    expect(changes.map((c) => c.id)).toEqual([
      addedA.canonicalReference,
      addedM.canonicalReference,
      removed.canonicalReference,
    ])
  })
})
