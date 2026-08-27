import fc from "fast-check"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { locateTargetFileName } from "../../scripts/changeset-file-locator.js"

/**
 * Property-based tests for locateTargetFileName's selection rule, generalizing
 * changeset-file-locator.test.ts's fixed examples over the number of marked/unmarked files present:
 * exactly one marked file -> that file; zero marked and exactly one unmarked -> that file; anything
 * else (ambiguous, or nothing at all) -> the dedicated fallback filename. Each property run gets its
 * own fresh tmp dir (created/removed inside the property function itself, not in beforeEach/afterEach)
 * since fast-check reuses the same `it` block across many runs -- a shared dir would leak files from
 * one run's scenario into the next's. Real filesystem I/O, so run counts are kept modest.
 */

const DEDICATED_FILENAME = "repo-contract.md"
const FILENAMES = ["a.md", "b.md", "c.md", "d.md"] as const

/** One state per FILENAMES entry: absent, carrying a machine marker, or a plain human file. */
const fileStateArbitrary = fc.array(fc.constantFrom("absent", "marked", "unmarked"), {
  minLength: FILENAMES.length,
  maxLength: FILENAMES.length,
})

describe("locateTargetFileName -- property-based", () => {
  it("selects the single marked/unmarked file when unambiguous, and falls back otherwise", async () => {
    await fc.assert(
      fc.asyncProperty(fileStateArbitrary, async (states) => {
        const root = await mkdtemp(
          path.join(os.tmpdir(), "repo-contract-changeset-file-locator-prop-"),
        )
        try {
          await mkdir(path.join(root, ".changeset"), { recursive: true })

          const markedFiles: string[] = []
          const unmarkedFiles: string[] = []

          for (const [index, state] of states.entries()) {
            const filename = FILENAMES[index]!
            if (state === "absent") continue
            const filePath = path.join(root, ".changeset", filename)
            if (state === "marked") {
              markedFiles.push(filename)
              await writeFile(
                filePath,
                `---\n"pkg": patch\n---\n\n<!-- repo-contract:api-contract:start:hash=h -->\ncontent\n<!-- repo-contract:api-contract:end -->\n`,
                "utf8",
              )
            } else {
              unmarkedFiles.push(filename)
              await writeFile(
                filePath,
                `---\n"pkg": patch\n---\n\nHuman note for ${filename}.\n`,
                "utf8",
              )
            }
          }

          const result = await locateTargetFileName(root)

          if (markedFiles.length === 1) {
            expect(result).toBe(markedFiles[0])
          } else if (markedFiles.length === 0 && unmarkedFiles.length === 1) {
            expect(result).toBe(unmarkedFiles[0])
          } else {
            expect(result).toBe(DEDICATED_FILENAME)
          }
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }),
      { numRuns: 40 },
    )
  })
})
