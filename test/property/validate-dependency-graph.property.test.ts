import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { validateDependencyGraph } from "../../src/config/validate-config.js"
import { DependencyDeclaredLaterError } from "../../src/errors.js"

/**
 * Property-based tests for validateDependencyGraph's backward-reference check, complementing
 * dependency-scheduler.property.test.ts's own graph-generation approach: a graph where every
 * dependency points strictly earlier (acyclic by construction, and the only shape declaration order
 * now permits) must never throw, while a graph built as a single ring (every id depends on the
 * next, wrapping around) always contains at least one edge pointing at an equal-or-later-declared
 * id -- a true cycle can never be linearized into a single declaration order without one -- so it
 * must always throw DependencyDeclaredLaterError.
 */

const ITEM_COUNT = 6
const CHECK_IDS = Array.from({ length: ITEM_COUNT }, (_, i) => `check${String(i)}`)

/** Item i's dependency bitmask only ever uses bits 0..i-1, so it can only reference strictly earlier items -- trivially acyclic. */
function bitmaskToDeps(mask: number, index: number): string[] {
  const deps: string[] = []
  for (let bit = 0; bit < index; bit += 1) {
    if ((mask & (1 << bit)) !== 0) deps.push(CHECK_IDS[bit]!)
  }
  return deps
}

const acyclicGraphArbitrary = fc
  .tuple(
    fc.constant(0),
    fc.nat({ max: 2 ** 1 - 1 }),
    fc.nat({ max: 2 ** 2 - 1 }),
    fc.nat({ max: 2 ** 3 - 1 }),
    fc.nat({ max: 2 ** 4 - 1 }),
    fc.nat({ max: 2 ** 5 - 1 }),
  )
  .map((masks) =>
    Object.fromEntries(
      masks.map((mask, index) => [CHECK_IDS[index]!, { dependsOn: bitmaskToDeps(mask, index) }]),
    ),
  )

const idPoolArbitrary = fc.uniqueArray(fc.constantFrom(..."abcdefgh".split("")), {
  minLength: 1,
  maxLength: 8,
})

describe("validateDependencyGraph -- property-based", () => {
  it("never throws for a graph where every dependency points strictly earlier (acyclic by construction)", () => {
    fc.assert(
      fc.property(acyclicGraphArbitrary, (checks) => {
        expect(() => {
          validateDependencyGraph(checks)
        }).not.toThrow()
      }),
      { numRuns: 200 },
    )
  })

  it("always rejects a ring graph (every id depends on the next, wrapping around) as a forward/self reference", () => {
    fc.assert(
      fc.property(idPoolArbitrary, (ids) => {
        const n = ids.length
        const checks = Object.fromEntries(
          ids.map((id, i) => [id, { dependsOn: [ids[(i + 1) % n]!] }]),
        )

        let caught: DependencyDeclaredLaterError | undefined
        try {
          validateDependencyGraph(checks)
        } catch (error) {
          expect(error).toBeInstanceOf(DependencyDeclaredLaterError)
          caught = error as DependencyDeclaredLaterError
        }
        expect(caught).toBeDefined()

        // A real edge from the ring, and the named dependency is genuinely not declared earlier
        // than the check declaring it -- the exact condition validateDependencyGraph rejects.
        expect(checks[caught!.checkId]?.dependsOn).toContain(caught!.dependencyId)
        expect(ids.indexOf(caught!.dependencyId)).toBeGreaterThanOrEqual(
          ids.indexOf(caught!.checkId),
        )
      }),
      { numRuns: 200 },
    )
  })
})
