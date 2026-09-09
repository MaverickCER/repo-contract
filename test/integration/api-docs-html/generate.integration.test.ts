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
 * What `render.test.ts`'s pure-function tests cannot prove on their own: that the HTML is actually
 * derived from the real Doc Model's TSDoc prose, not from a hand-rolled signature-only renderer
 * that happens to pass every determinism/link-rewrite test. This does one real compile+extraction
 * (not two -- see [[api-contract-test-isolation]] on heavy per-test footprints tipping vitest's
 * coverage provider into a race under the full concurrent contract) and asserts three things a
 * signature-only or mocked pipeline would fail: the distinctive doc-comment sentence appears, a
 * plausible-but-absent string does not, and the output carries real prose rather than only a
 * `declare function` signature.
 */
describe("the real API-Extractor -> api-documenter -> HTML pipeline", () => {
  let root: string | undefined

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-html-integration-"))
  })

  afterEach(async () => {
    await removeTempDir(root)
    root = undefined
  })

  it("renders the real TSDoc prose, not a signature-only or mocked artifact", async () => {
    if (root === undefined) throw new Error("beforeEach did not set root")

    const fixture = await buildFixturePackage(
      root,
      `
/**
 * A sentinel sentence unique to this one doc comment, so finding it in the rendered HTML proves
 * the Doc Model's real TSDoc prose survived extraction, markdown rendering, and HTML rendering.
 * @public
 */
export function getWidgetCount(): number {
  return 0
}
`,
    )

    const markdownDir = path.join(root, "md")
    generateMarkdownPages(fixture.apiJsonPath, markdownDir)

    const markdown = await readFile(
      path.join(markdownDir, "fixture-package.getwidgetcount.md"),
      "utf8",
    )
    const html = markdownToHtml(markdown)

    // Derived from the real doc comment -- present verbatim, in both the markdown and the HTML.
    expect(markdown).toContain("A sentinel sentence unique to this one doc comment")
    expect(html).toContain("A sentinel sentence unique to this one doc comment")
    // Not hardcoded/mocked: a plausible sentence that is not in the source does not appear.
    expect(html).not.toContain("A completely different sentence")
    // Real prose, not just a signature dump: a full sentence with a trailing period is rendered.
    expect(html).toMatch(/survived extraction, markdown rendering, and HTML rendering\./)
  })
})
