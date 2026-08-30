import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { detectSchemaVersionDrift } from "../../scripts/api-contract/schema-version-consistency.js"
import type { NormalizedMember } from "../../scripts/api-contract/model-normalizer.js"

/**
 * Property-based tests for detectSchemaVersionDrift's central rule: fire exactly when an interface's
 * `version` literal member is unchanged while some *other* member of that interface changed (added,
 * removed, or modified). Uses synthetic NormalizedMember maps directly -- same style as
 * compatibility-classifier.test.ts -- rather than real Extractor fixtures (schema-version-consistency.
 * test.ts already covers the real-model integration; this fuzzes the pure decision logic itself).
 */

function member(
  overrides: Partial<NormalizedMember> & { canonicalReference: string },
): NormalizedMember {
  return {
    scopedName: overrides.canonicalReference,
    kind: "PropertySignature",
    isTopLevelExport: false,
    releaseTag: "public",
    isDeprecated: false,
    ...overrides,
  }
}

const literalArbitrary = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }).map((n) => String(n)),
  fc.stringMatching(/^[a-zA-Z0-9]{0,6}$/).map((s) => `"${s}"`),
)

const modeArbitrary = fc.constantFrom("same", "modified", "removed", "added")

describe("detectSchemaVersionDrift -- property-based", () => {
  it("flags drift exactly when the version literal is unchanged while some other member of the interface changed", () => {
    fc.assert(
      fc.property(
        literalArbitrary,
        fc.boolean(),
        modeArbitrary,
        (literalBefore, versionLiteralChanged, mode) => {
          // Derived, not independently sampled: two random literals are almost
          // never equal, so an independent `literalAfter` left the drift-positive
          // branch (`literal unchanged` + `sibling changed`) essentially
          // unreachable across 200 runs. The boolean forces ~50% of runs through
          // it. The `/* v2 */` suffix cannot collide with either literal shape.
          const literalAfter = versionLiteralChanged ? `${literalBefore} /* v2 */` : literalBefore
          const interfaceRef = "!pkg#Evidence:interface"
          const interfaceMember = member({
            canonicalReference: interfaceRef,
            kind: "Interface",
            isTopLevelExport: true,
          })

          const versionBefore = member({
            canonicalReference: `${interfaceRef}.version`,
            parentCanonicalReference: interfaceRef,
            name: "version",
            propertyTypeExcerptText: literalBefore,
          })
          const versionAfter = member({
            canonicalReference: `${interfaceRef}.version`,
            parentCanonicalReference: interfaceRef,
            name: "version",
            propertyTypeExcerptText: literalAfter,
          })

          const sibling = member({
            canonicalReference: `${interfaceRef}.sibling`,
            parentCanonicalReference: interfaceRef,
            name: "sibling",
            propertyTypeExcerptText: "string",
          })

          let currentSiblings: NormalizedMember[]
          switch (mode) {
            case "same":
              currentSiblings = [sibling]
              break
            case "modified":
              currentSiblings = [member({ ...sibling, propertyTypeExcerptText: "number" })]
              break
            case "removed":
              currentSiblings = []
              break
            case "added":
              currentSiblings = [
                sibling,
                member({
                  canonicalReference: `${interfaceRef}.extra`,
                  parentCanonicalReference: interfaceRef,
                  name: "extra",
                  propertyTypeExcerptText: "boolean",
                }),
              ]
              break
          }

          const baseline = new Map<string, NormalizedMember>([
            [interfaceRef, interfaceMember],
            [versionBefore.canonicalReference, versionBefore],
            [sibling.canonicalReference, sibling],
          ])
          const current = new Map<string, NormalizedMember>([
            [interfaceRef, interfaceMember],
            [versionAfter.canonicalReference, versionAfter],
            ...currentSiblings.map((m): [string, NormalizedMember] => [m.canonicalReference, m]),
          ])

          const drift = detectSchemaVersionDrift(baseline, current)
          const expectDrift = mode !== "same" && !versionLiteralChanged

          if (expectDrift) {
            expect(drift).toHaveLength(1)
            expect(drift[0]).toMatchObject({
              id: `${interfaceRef}#schema-version-literal`,
              path: interfaceMember.scopedName,
              kind: "schema-version-literal-stale",
              compatibility: "breaking",
            })
          } else {
            expect(drift).toEqual([])
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
