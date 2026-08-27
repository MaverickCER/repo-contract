import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { renderChangesetFile, splitFrontmatter } from "../../scripts/helpers.js"

/**
 * Property-based tests for the one Changesets file-format primitive shared by
 * changeset-manager.ts and table-manager.ts. `packageName` is written
 * double-quoted (`"${packageName}": ...`), so it's restricted to a
 * quote/newline-free token; `level` is written as a bare, unquoted YAML plain
 * scalar (`...: ${level}`), which additionally can't start with a YAML
 * indicator character like `@` -- restricted to a plain alphanumeric token,
 * matching the only values either mechanism ever actually writes there
 * ("patch"/"minor"/"major"). `body` excludes lines that are exactly `---`
 * (with an optional trailing `\r`): FRONTMATTER_REGEX's non-greedy
 * frontmatter capture stops at the first such line, so a body containing one
 * would be genuinely ambiguous with the closing delimiter -- not a
 * round-trip counterexample.
 */

const packageNameArbitrary = fc.stringMatching(/^[a-zA-Z0-9@/._-]{1,20}$/)
const levelArbitrary = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/)

const bodyArbitrary = fc
  .string({ maxLength: 200 })
  .filter((body) => !body.split(/\r?\n/).some((line) => line === "---"))

describe("splitFrontmatter/renderChangesetFile -- property-based", () => {
  it("round-trips for any token-like package name/level and any frontmatter-safe body", () => {
    fc.assert(
      fc.property(
        packageNameArbitrary,
        levelArbitrary,
        bodyArbitrary,
        (packageName, level, body) => {
          const rendered = renderChangesetFile(packageName, level, body)
          const { rawLevel, body: parsedBody } = splitFrontmatter(rendered, packageName)

          expect(rawLevel).toBe(level)
          expect(parsedBody).toBe(`\n${body.trim()}\n`)
        },
      ),
      { numRuns: 200 },
    )
  })

  it("rendered output always parses back to the same level regardless of which package name it's read under", () => {
    fc.assert(
      fc.property(
        packageNameArbitrary,
        packageNameArbitrary,
        levelArbitrary,
        bodyArbitrary,
        (packageName, otherPackageName, level, body) => {
          fc.pre(packageName !== otherPackageName)
          const rendered = renderChangesetFile(packageName, level, body)

          expect(splitFrontmatter(rendered, packageName).rawLevel).toBe(level)
          expect(splitFrontmatter(rendered, otherPackageName).rawLevel).toBeUndefined()
        },
      ),
      { numRuns: 200 },
    )
  })

  it("content with no leading '---' delimiter always passes through unparsed", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((s) => !s.startsWith("---")),
        packageNameArbitrary,
        (content, packageName) => {
          expect(splitFrontmatter(content, packageName)).toEqual({
            rawLevel: undefined,
            body: content,
          })
        },
      ),
      { numRuns: 200 },
    )
  })
})
