// Entry point for repo-contract's `accessibility` check (see
// repo-contract.config.ts). Runs pa11y (WCAG2AA, its default standard)
// against a short list of built pages and prints a
// `{ ok, value | error }` result to stdout, matching the
// file-based-tool-output pattern the docs/markdownlint check already uses.
// pa11y drives a real headless Chromium page via puppeteer -- an actual
// accessibility tree, not static markup analysis -- so contrast, focus
// order, and ARIA issues are caught the same way a real browser would
// surface them, confirmed by a real run against this page (see
// specs/decisions/0008-self-hosting-tool-and-dependency-choices.md).
//
// Tests each page directly via a file:// URL -- none has a build step
// (unlike dist/), so nothing needs to run first.
//
// PAGES covers the shared page shell/template mechanically, not every
// generated page individually: docs/index.html (the main site), plus, once
// scripts/api-docs-html/ has run, docs/api/index.html (the hand-authored
// landing page) and one representative generated per-symbol page --
// specifically one containing a real <table> (api-documenter's own raw
// table markup carries no <caption>/scope, the actual risk case), not all
// ~70+ generated pages, which all share one template and one stylesheet.
// The ~70+-page docs/api/**/*.html generation is release-cadence only (see
// specs/decisions/0008's amendment); if docs/api/ hasn't been generated at
// all in this working tree, those two entries are silently skipped below,
// same as before this comment. But once docs/api/ HAS been generated, the
// specific representative page (REPRESENTATIVE_TABLE_PAGE below) is
// required to exist -- if the symbol it names is ever renamed or removed,
// this check fails loudly naming it, rather than silently losing its own
// table-markup coverage the next time someone updates PAGES.
//
// pa11y is driven through its Node API rather than its CLI: the CLI cannot
// pass `chromeLaunchConfig` (needed for `--no-sandbox` below), and it also
// forced this script to re-parse the CLI's own stdout as JSON, which turned
// any Chromium launch failure into a misleading "Unexpected end of JSON
// input" instead of the real error. The API returns the findings directly
// and lets a genuine failure surface as a thrown Error with a usable
// message.

import pa11y from "pa11y"
import { access } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")
const docsApiDir = join(repoRoot, "docs", "api")

const MAIN_SITE_PAGE = join(repoRoot, "docs", "index.html")
const API_LANDING_PAGE = join(docsApiDir, "index.html")
// A page containing a real <table> -- api-documenter's own raw table markup carries no
// <caption>/scope, the actual accessibility risk case this entry exists to cover. If this exact
// symbol is ever renamed or removed, update this path -- see the module comment above for why a
// missing docs/api/ directory is fine, but a missing page once docs/api/ exists is not.
const REPRESENTATIVE_TABLE_PAGE = join(
  docsApiDir,
  "repo-contract-helpers",
  "repo-contract.hashrequirementfields.html",
)

const CHROME_LAUNCH_CONFIG = {
  // Chromium's own sandbox needs kernel unprivileged-user-namespace
  // support, which Ubuntu 23.10+ (GitHub's `ubuntu-latest` runner)
  // restricts via AppArmor -- without these flags the bundled Chromium
  // exits immediately on launch and pa11y produces no report at all. Safe
  // here: every page this check ever loads is this repository's own
  // static, committed HTML over a file:// URL, never untrusted content.
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves which pages to scan: always the main site; the two docs/api/ pages only once
 * docs/api/ has actually been generated in this working tree (release-cadence only, so it's
 * normal for it to be absent between releases) -- but once that directory exists, both must too,
 * or this throws naming exactly which one is missing, rather than silently scanning fewer pages.
 * @returns Absolute paths of every page to scan.
 */
async function resolvePages() {
  const pages = [MAIN_SITE_PAGE]
  if (!(await pathExists(docsApiDir))) return pages

  for (const page of [API_LANDING_PAGE, REPRESENTATIVE_TABLE_PAGE]) {
    if (!(await pathExists(page))) {
      throw new Error(
        `docs/api/ exists but the expected page ${page} does not. If the symbol it names was renamed or removed, update REPRESENTATIVE_TABLE_PAGE in scripts/check-accessibility.mjs.`,
      )
    }
    pages.push(page)
  }
  return pages
}

try {
  const existingPages = await resolvePages()

  const perPage = await Promise.all(
    existingPages.map(async (path) => {
      const result = await pa11y(pathToFileURL(path).href, {
        chromeLaunchConfig: CHROME_LAUNCH_CONFIG,
      })
      // Attach the repo-relative page path to every issue -- with more than one page scanned, a
      // finding's rationale has to say which page it is on to be actionable.
      const page = relative(repoRoot, path)
      return result.issues.map((issue) => ({ ...issue, page }))
    }),
  )

  process.stdout.write(JSON.stringify({ ok: true, value: perPage.flat() }))
  process.exitCode = 0
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exitCode = 1
}
