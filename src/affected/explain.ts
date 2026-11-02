import { describeKey, testKey } from "./keys.js"
import type { AffectedResult } from "./types.js"

/**
 * Explains why each test is in the affected set, as one line per test:
 * `test/b.test.ts <- src/b.ts depends on a changed symbol <- src/a.ts exports a changed \`foo\` <- ...`.
 * @param result - A result from `computeAffected`.
 * @returns One line per affected test (or a single line saying why everything is affected), sorted.
 */
export function explainAffected(result: AffectedResult): string[] {
  if (result.scope === "full") {
    const because = result.fullBecause
    return [
      `full run: ${because === undefined ? "unknown reason" : `${because.reason} (${because.file})`}${
        because?.detail === undefined ? "" : ` -- ${because.detail}`
      }`,
    ]
  }
  return result.affectedTests.map((test) => {
    // The test's own key plus at most one step per recorded cause: finite by construction, and a
    // hand-built result with a cycle stops advancing at its first repeat.
    const { keys } = Array.from({ length: result.causes.size + 1 }).reduce<{
      keys: string[]
      key: string | undefined
    }>(
      (walk) =>
        walk.key === undefined || walk.keys.includes(walk.key)
          ? walk
          : { keys: [...walk.keys, walk.key], key: result.causes.get(walk.key) },
      { keys: [], key: testKey(test) },
    )
    // A name hopping between bindings inside one file is noise; the origin name is the signal.
    const shown = keys.filter(
      (key, index) => !key.startsWith("local:") || keys[index + 1]?.startsWith("changed:") === true,
    )
    return shown.map(describeKey).join(" <- ")
  })
}
