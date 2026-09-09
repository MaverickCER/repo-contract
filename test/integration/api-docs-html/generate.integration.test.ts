import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildFixturePackage } from "../../helpers/api-contract/build-fixture-package.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"
import { generateMarkdownPages } from "../../../scripts/api-docs-html/documenter-adapter.js"
import { markdownToHtml } from "../../../scripts/api-docs-html/render.js"

/**
 * Exercises the real end-to-end pipeline this feature depends on -- source -> API Extractor's Doc
 * Model -> api-documenter's markdown -> this feature's own HTML rendering -- against a real, tiny
 * fixture package built by the same helper api-contract's own tests use, per this project's
 * real-behavior-over-mocking house style.
 *
 * The specific thing `render.test.ts`'s pure-function tests cannot prove on their own: that this
 * pipeline actually reflects a real TSDoc change, not just that it runs deterministically on a
 * fixed input. A pipeline that silently stopped reading the Doc Model (e.g. a hand-rolled
 * signature-only renderer swapped in by mistake) would still pass every determinism/link-rewrite
 * test while failing this one.
 */
describe("the real API-Extractor -> api-documenter -> HTML pipeline reflects real doc changes", () => {
  let root: string | undefined

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-html-integration-"))
  })

  afterEach(async () => {
    await removeTempDir(root)
    root = undefined
  })

  it("carries a real TSDoc summary all the way through to the rendered HTML", async () => {
    if (root === undefined) throw new Error("beforeEach did not set root")

    const fixture = await buildFixturePackage(
      root,
      `
/**
 * A sentinel sentence this test looks for after the full pipeline runs -- not present anywhere
 * except this one doc comment, so finding it in the rendered HTML proves the Doc Model's real
 * TSDoc prose survived extraction, markdown rendering, and HTML rendering intact.
 * @public
 */
export function getWidgetCount(): number {
  return 0
}
`,
    )

    const markdownDir = path.join(root, "md")
    generateMarkdownPages(fixture.apiJsonPath, markdownDir)

    const page = await readFile(path.join(markdownDir, "fixture-package.getwidgetcount.md"), "utf8")
    expect(page).toContain("A sentinel sentence this test looks for after the full pipeline runs")

    const html = markdownToHtml(page)
    expect(html).toContain("A sentinel sentence this test looks for after the full pipeline runs")
  })

  it("changes the rendered HTML when the source TSDoc comment changes", async () => {
    if (root === undefined) throw new Error("beforeEach did not set root")

    const source = (summary: string) => `
/**
 * ${summary}
 * @public
 */
export function getWidgetCount(): number {
  return 0
}
`

    const before = await buildFixturePackage(root, source("The original summary."))
    const beforeMarkdownDir = path.join(root, "md-before")
    generateMarkdownPages(before.apiJsonPath, beforeMarkdownDir)
    const beforeHtml = markdownToHtml(
      await readFile(path.join(beforeMarkdownDir, "fixture-package.getwidgetcount.md"), "utf8"),
    )

    // A fresh scratch root -- buildFixturePackage recompiles in place, and this proves the
    // *content* changed, not merely that a second run produced different output for unrelated
    // reasons (a stale cache, a nondeterministic ordering, etc).
    const secondRoot = await mkdtemp(
      path.join(os.tmpdir(), "repo-contract-api-docs-html-integration-"),
    )
    try {
      const after = await buildFixturePackage(secondRoot, source("A completely different summary."))
      const afterMarkdownDir = path.join(secondRoot, "md-after")
      generateMarkdownPages(after.apiJsonPath, afterMarkdownDir)
      const afterHtml = markdownToHtml(
        await readFile(path.join(afterMarkdownDir, "fixture-package.getwidgetcount.md"), "utf8"),
      )

      expect(beforeHtml).toContain("The original summary.")
      expect(beforeHtml).not.toContain("A completely different summary.")
      expect(afterHtml).toContain("A completely different summary.")
      expect(afterHtml).not.toContain("The original summary.")
    } finally {
      await removeTempDir(secondRoot)
    }
  })
})
