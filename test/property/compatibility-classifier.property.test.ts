import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { classifyContractChanges } from "../../scripts/api-contract/compatibility-classifier.js"
import type { ResolveAssignability } from "../../scripts/api-contract/compatibility-classifier.js"
import type { ContractImpact } from "../../scripts/api-contract/evidence-types.js"
import type {
  NormalizedMember,
  ReleaseTagLevel,
} from "../../scripts/api-contract/model-normalizer.js"

/**
 * Property-based tests for classifyContractChanges's two documented, structural invariants --
 * `changes` sorted by `id`, and `impact` always the max-severity rank across `changes[].compatibility`
 * -- which hold regardless of which specific change kinds fire. The detailed per-field classification
 * rules (added-required-param is breaking, etc.) are already covered example-by-example in
 * compatibility-classifier.test.ts; these tests instead fuzz the member-map shape itself (random
 * subsets of ids present on each side, random field diffs) to exercise combinations no fixed example
 * set enumerates, while checking only the two properties true of every possible outcome.
 */

const IMPACT_RANK: Record<ContractImpact, number> = {
  unchanged: 0,
  compatible: 1,
  unknown: 2,
  breaking: 3,
}

const resolvers: readonly ResolveAssignability[] = [
  () => "compatible",
  () => "breaking",
  () => "unknown",
]

const idArbitrary = fc.uniqueArray(fc.constantFrom(..."abcdefgh".split("")), {
  minLength: 0,
  maxLength: 6,
})

function memberArbitrary(id: string): fc.Arbitrary<NormalizedMember> {
  return fc.record({
    canonicalReference: fc.constant(id),
    scopedName: fc.constant(id),
    kind: fc.constantFrom("Function", "Property", "Variable", "EnumMember", "TypeAlias"),
    isTopLevelExport: fc.boolean(),
    releaseTag: fc.constantFrom<ReleaseTagLevel>("public", "beta", "alpha", "internal"),
    isDeprecated: fc.boolean(),
    isOptional: fc.option(fc.boolean(), { nil: undefined }),
    isReadonly: fc.option(fc.boolean(), { nil: undefined }),
    propertyTypeExcerptText: fc.option(fc.constantFrom("string", "number", "boolean"), {
      nil: undefined,
    }),
    returnTypeExcerptText: fc.option(fc.constantFrom("void", "string", "number"), {
      nil: undefined,
    }),
    initializerExcerptText: fc.option(fc.constantFrom("0", "1", "2"), { nil: undefined }),
    parameters: fc.option(
      fc.array(
        fc.record({
          name: fc.constantFrom("a", "b"),
          isOptional: fc.boolean(),
          typeExcerptText: fc.constantFrom("string", "number"),
        }),
        { maxLength: 3 },
      ),
      { nil: undefined },
    ),
  })
}

/** Maps a subset of `ids` (chosen independently per id via `present`) to a randomly generated member for each. */
function memberMapArbitrary(
  ids: readonly string[],
): fc.Arbitrary<ReadonlyMap<string, NormalizedMember>> {
  return fc
    .tuple(...ids.map((id) => fc.tuple(fc.boolean(), memberArbitrary(id))))
    .map(
      (entries) =>
        new Map(
          entries
            .filter(([present]) => present)
            .map(([, member]) => [member.canonicalReference, member]),
        ),
    )
}

describe("classifyContractChanges -- property-based", () => {
  it("changes is always sorted by id, and impact always equals the max compatibility rank across changes", () => {
    fc.assert(
      fc.property(
        idArbitrary.chain((ids) => fc.tuple(memberMapArbitrary(ids), memberMapArbitrary(ids))),
        fc.constantFrom(...resolvers),
        ([baseline, current], resolveAssignability) => {
          const { changes, impact } = classifyContractChanges(baseline, current, {
            resolveAssignability,
          })

          for (let i = 1; i < changes.length; i++) {
            expect(changes[i - 1]!.id.localeCompare(changes[i]!.id)).toBeLessThanOrEqual(0)
          }

          const expectedImpact = changes.reduce<ContractImpact>(
            (acc, change) =>
              IMPACT_RANK[change.compatibility] > IMPACT_RANK[acc] ? change.compatibility : acc,
            "unchanged",
          )
          expect(impact).toBe(expectedImpact)
        },
      ),
      { numRuns: 200 },
    )
  })

  it("an identical baseline/current map always yields an empty diff and unchanged impact", () => {
    fc.assert(
      fc.property(idArbitrary, fc.constantFrom(...resolvers), (ids, resolveAssignability) => {
        fc.pre(ids.length > 0)
        const members = ids.map((id) => ({
          canonicalReference: id,
          scopedName: id,
          kind: "Function",
          isTopLevelExport: true,
          releaseTag: "public" as const,
          isDeprecated: false,
        }))
        const map = new Map(members.map((m) => [m.canonicalReference, m]))

        const { changes, impact } = classifyContractChanges(map, map, { resolveAssignability })
        expect(changes).toEqual([])
        expect(impact).toBe("unchanged")
      }),
      { numRuns: 100 },
    )
  })
})
