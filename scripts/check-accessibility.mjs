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
//
// `pa11y`/`puppeteer` are real, hard `devDependencies` of this package, but
// the real `puppeteer` package carries its own Chromium-download
// `postinstall` script, which this organization's public packages must ship
// with zero install scripts of any kind (a Socket.dev "Install scripts"
// finding directly hurts a package's own supply-chain score). package.json's
// own `overrides` field aliases `puppeteer` to `puppeteer-core` wherever
// pa11y itself resolves it -- pa11y's `require("puppeteer")` transparently
// gets puppeteer-core's identical launch API, with no bundled browser and,
// critically, no install script at all. `findChromeExecutable` below
// supplies the browser puppeteer-core no longer downloads: a system
// Chrome/Chromium, auto-detected the same way a developer's own machine or a
// CI runner already has one (GitHub Actions' own `ubuntu-latest` images ship
// Google Chrome preinstalled). Ported from `internal-package-contract`'s own
// generalized copy of this script -- see that repo's
// `scripts/check-accessibility.mjs` doc comment.

import pa11y from "pa11y"
import { sync as spawnSync } from "cross-spawn"
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

// Every well-known system Chrome/Chromium install location this check knows to look for, in
// priority order, per platform -- checked only if `PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH`
// (an explicit override) isn't already set. Covers GitHub Actions' own `ubuntu-latest` runner
// image (ships Google Chrome preinstalled) and the common macOS/Linux developer-machine defaults.
const CANDIDATE_EXECUTABLE_PATHS = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
}

// A last-resort PATH lookup for a handful of common binary names -- covers a Chromium installed
// under a name/location this check's own candidate list doesn't happen to enumerate.
const PATH_LOOKUP_NAMES = ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"]

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Finds a real, usable Chrome/Chromium executable on this machine -- `puppeteer-core` (see this
 * module's own doc comment for why it's used in place of real `puppeteer`) bundles no browser of
 * its own and requires one to be supplied explicitly.
 * @returns The executable's absolute path, or `undefined` if none could be found.
 */
async function findChromeExecutable() {
  const override = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_PATH
  if (override && (await pathExists(override))) return override

  const candidates = CANDIDATE_EXECUTABLE_PATHS[process.platform] ?? []
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }

  for (const name of PATH_LOOKUP_NAMES) {
    const which = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
      encoding: "utf8",
    })
    const found = which.stdout?.split("\n")[0]?.trim()
    if (which.status === 0 && found) return found
  }

  return undefined
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
  const executablePath = await findChromeExecutable()
  if (executablePath === undefined) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error:
          "no system Chrome/Chromium executable found. Install one, or set PUPPETEER_EXECUTABLE_PATH.",
      }),
    )
    process.exitCode = 0
  } else {
    const chromeLaunchConfig = {
      executablePath,
      // Chromium's own sandbox needs kernel unprivileged-user-namespace
      // support, which Ubuntu 23.10+ (GitHub's `ubuntu-latest` runner)
      // restricts via AppArmor -- without these flags Chrome exits
      // immediately on launch and pa11y produces no report at all. Safe
      // here: every page this check ever loads is this repository's own
      // static, committed HTML over a file:// URL, never untrusted content.
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    }

    const existingPages = await resolvePages()

    const perPage = await Promise.all(
      existingPages.map(async (path) => {
        const result = await pa11y(pathToFileURL(path).href, { chromeLaunchConfig })
        // Attach the repo-relative page path to every issue -- with more than one page scanned,
        // a finding's rationale has to say which page it is on to be actionable.
        const page = relative(repoRoot, path)
        return result.issues.map((issue) => ({ ...issue, page }))
      }),
    )

    process.stdout.write(JSON.stringify({ ok: true, value: perPage.flat() }))
    process.exitCode = 0
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exitCode = 1
}
