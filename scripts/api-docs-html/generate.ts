// Human/CI-invoked command (`npm run api-docs:html`, and the release workflow -- see
// .github/workflows/api-baseline.yml) that regenerates docs/api/: one HTML page per exported API
// item, across all three targets (repo-contract, repo-contract/presets, repo-contract/helpers),
// plus a hand-authored landing page. Release-cadence only, by design -- unlike
// scripts/api-docs/generate.ts's markdown reports, docs/api/ carries no every-commit freshness
// check (an explicit, accepted limitation, not an oversight -- see specs/decisions/0008 and
// docs/api/index.html's own freshness note).
//
// Pipeline: generateApiReports (report-targets.ts) preserves each target's Doc Model JSON instead
// of discarding it -> generateMarkdownPages (documenter-adapter.ts) renders that Doc Model into
// api-documenter's own markdown, into a scratch dir -> each page is rendered to HTML
// (render.ts) and written under docs/api/<target>/.
//
// Fully wipes docs/api/ before writing: a symbol removed from the public API must have its page
// disappear, not linger as an orphan nothing links to anymore.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { generateApiReports } from "../api-docs/report-targets.js"
import { generateMarkdownPages } from "./documenter-adapter.js"
import { escapeAttribute, extractPageTitle, markdownToHtml, renderPage } from "./render.js"

const DOCS_API_RELATIVE_PATH = "docs/api"

/** One target's generation result -- used to build the landing page and to report progress. */
export interface TargetSummary {
  readonly reportFileName: string
  readonly pageCount: number
}

/**
 * Regenerates `docs/api/` from this repository's own built `dist/.dts/` -- the full pipeline
 * described in this file's own header comment.
 * @param root - Absolute path to the repository root; must contain a built `dist/` and `tsconfig.json`.
 * @returns Every target's generation summary, in the same order `report-targets.ts` declares them.
 */
export async function runGenerate(root: string): Promise<readonly TargetSummary[]> {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-html-"))
  const docsApiDir = path.join(root, DOCS_API_RELATIVE_PATH)

  try {
    const reports = await generateApiReports(root, path.join(scratchDir, "reports"), {
      docModelFolder: path.join(scratchDir, "doc-models"),
    })

    await rm(docsApiDir, { recursive: true, force: true })
    await mkdir(docsApiDir, { recursive: true })

    const summaries: TargetSummary[] = []

    for (const report of reports) {
      if (report.apiJsonPath === undefined) {
        // Would mean generateApiReports silently stopped honoring docModelFolder -- a real bug,
        // not a condition this generator can recover from or work around.
        throw new Error(
          `Internal error: "${report.reportFileName}" has no apiJsonPath (docModelFolder was not honored by generateApiReports).`,
        )
      }

      const markdownDir = path.join(scratchDir, "md", report.reportFileName)
      generateMarkdownPages(report.apiJsonPath, markdownDir)

      const targetDir = path.join(docsApiDir, report.reportFileName)
      await mkdir(targetDir, { recursive: true })

      const markdownFiles = (await readdir(markdownDir)).filter((file) => file.endsWith(".md"))

      // api-documenter emits both `index.md` (a one-row "Packages" list -- a dead-end intermediate
      // that costs a click) and `repo-contract.md` (the real package home: every export with its
      // summary). Skip the former, and write the latter's HTML to `index.html` as well, so every
      // path -- the landing card, and each symbol page's "Home" breadcrumb -- lands on real content.
      const PACKAGE_HOME_MD = "repo-contract.md"
      const pageFiles = markdownFiles.filter((file) => file !== "index.md")
      if (!pageFiles.includes(PACKAGE_HOME_MD)) {
        throw new Error(
          `Internal error: "${report.reportFileName}" produced no ${PACKAGE_HOME_MD} (api-documenter's package-home naming changed).`,
        )
      }

      for (const file of pageFiles) {
        const markdown = await readFile(path.join(markdownDir, file), "utf8")
        const html = renderPage({
          title: extractPageTitle(markdown),
          bodyHtml: markdownToHtml(markdown),
          rootRelativePath: "../..",
          apiIndexRelativePath: "../index.html",
        })
        await writeFile(path.join(targetDir, file.replace(/\.md$/, ".html")), html, "utf8")
        if (file === PACKAGE_HOME_MD) {
          await writeFile(path.join(targetDir, "index.html"), html, "utf8")
        }
      }

      summaries.push({ reportFileName: report.reportFileName, pageCount: pageFiles.length })
    }

    await writeFile(path.join(docsApiDir, "index.html"), renderLandingPage(summaries), "utf8")

    return summaries
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

/** The import path a consumer writes for each generated target. */
const IMPORT_PATH: Readonly<Record<string, string>> = {
  "repo-contract": `import { ... } from "repo-contract"`,
  "repo-contract-presets": `import { ... } from "repo-contract/presets"`,
  "repo-contract-helpers": `import { ... } from "repo-contract/helpers"`,
}

/**
 * The hand-authored `docs/api/index.html` landing page -- one card per generated target, each
 * linking to `./<target>/` (which serves the package-home page: every export with its summary),
 * not the intermediate "Packages" list `runGenerate` no longer emits. States its own
 * release-cadence freshness plainly, confidence first, with the always-fresh markdown reports
 * linked as the fallback for anyone checking against an unreleased commit.
 * @param summaries - Every target's generation summary, for the page-count line on each card.
 * @returns The complete landing page HTML.
 */
function renderLandingPage(summaries: readonly TargetSummary[]): string {
  const cards = summaries
    .map((summary) => {
      const name = summary.reportFileName
      const importLine = IMPORT_PATH[name]
      const importHtml =
        importLine === undefined
          ? ""
          : `\n            <p><code>${escapeAttribute(importLine)}</code></p>`
      return `<li class="adoption-card">
            <h3><a href="./${name}/">${name}</a></h3>${importHtml}
            <p>${String(summary.pageCount)} documented page(s) &mdash; every function, type, field, and error code.</p>
          </li>`
    })
    .join("\n")

  const bodyHtml = `<h1>API reference</h1>
        <p>Generated from this package's own TSDoc comments on every release &mdash; every page here is real documentation, byte-compared against the source, not a hand-maintained copy. Pick a target to see its full export list; each export links to its own page with the signature, parameters, and description.</p>
        <ul class="adoption-grid">
${cards}
        </ul>
        <p>New to repo-contract? Start with the <a href="https://github.com/MaverickCER/repo-contract#readme">README</a> and the <a href="https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md">Guide</a>; this reference is for looking up an exact shape once you know what you need.</p>
        <p>Checking against an unreleased commit? The <a href="https://github.com/MaverickCER/repo-contract/tree/main/docs/api-report">markdown API reports</a> are regenerated and verified on every commit by this repository's own <code>api-docs</code> check.</p>`

  return renderPage({
    title: "API reference",
    bodyHtml,
    rootRelativePath: "..",
    apiIndexRelativePath: "index.html",
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd()
  const summaries = await runGenerate(root)

  for (const summary of summaries) {
    process.stderr.write(
      `Wrote ${DOCS_API_RELATIVE_PATH}/${summary.reportFileName}/ (${String(summary.pageCount)} page(s))\n`,
    )
  }
}
