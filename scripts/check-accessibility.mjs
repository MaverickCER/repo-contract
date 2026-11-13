// Entry point for repo-contract's `accessibility` check (see
// repo-contract.config.ts). Runs pa11y (WCAG2AA, its default standard)
// against a short list of built pages. Prints a `{ ok, value | error }`
// result to stdout, matching the file-based-tool-output pattern the
// docs/markdownlint check already uses.
//
// pa11y drives a headless Chromium page via puppeteer, so it checks the
// browser's accessibility tree, not static markup. Contrast, focus order and
// ARIA issues surface as a browser would show them (see
// specs/decisions/0008-self-hosting-tool-and-dependency-choices.md).
//
// Tests each page directly via a file:// URL. None has a build step (unlike
// dist/), so nothing needs to run first.
//
// PAGES covers the shared page shell/template mechanically, not every
// generated page individually. It holds docs/index.html (the main site).
// Once `npm run docs:api` (TypeDoc) has run, it also holds
// docs/api/index.html, TypeDoc's own generated landing page (not
// hand-authored). The docs/api/ tree is regenerated fresh on every CI run and
// never committed (see .gitignore and RELEASING.md's "GitHub Pages" section). It
// is normal for it to be absent in a bare local checkout until that script
// has run once. If it's missing here, that one entry is silently skipped
// below.
//
// TypeDoc's default theme renders symbol members as <dl>/<div> structures,
// with no <table> elements. So the landing page covers the shared
// template/theme every generated page reuses. Add a representative page here
// if a future API-doc tool or theme emits raw tables.
//
// pa11y is driven through its Node API rather than its CLI. The CLI cannot
// pass `chromeLaunchConfig`, which `--no-sandbox` below needs. It also forced
// this script to re-parse the CLI's own stdout as JSON. That turned any
// Chromium launch failure into a misleading "Unexpected end of JSON input"
// instead of the real error. The API returns the findings directly and lets
// a genuine failure surface as a thrown Error with a usable message.
//
// `pa11y`/`puppeteer` are real, hard `devDependencies` of this package. The
// real `puppeteer` package carries its own Chromium-download `postinstall`
// script. This organization's public packages must ship with zero install
// scripts of any kind. A Socket.dev "Install scripts" finding directly hurts
// a package's own supply-chain score. The `overrides` field in package.json
// aliases `puppeteer` to `puppeteer-core` wherever pa11y itself resolves it.
// The `require("puppeteer")` inside pa11y transparently gets
// puppeteer-core's identical launch API, with no bundled browser and,
// critically, no install script at all.
//
// `findChromeExecutable` below supplies the browser puppeteer-core no longer
// downloads: a system Chrome/Chromium. It auto-detects the one a developer's
// own machine or a CI runner already has. GitHub Actions' own `ubuntu-latest`
// images ship Google Chrome preinstalled.
//
// This script is the original this pattern was ported FROM.
// `internal-package-contract`'s own `scripts/check-accessibility.mjs` is a
// near-direct port of it, generalized to run against whichever package
// installs that shared devDependency. That file's own doc comment lists the
// divergences. One is its own conclusion that a TypeDoc-based docs/api/ has
// no <table>-markup accessibility case left to scan for. This file reaches
// the same conclusion independently above.

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

// Every well-known system Chrome/Chromium install location this check knows to look for, in
// priority order, per platform. Checked only if `PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH`
// (an explicit override) isn't already set. Covers GitHub Actions' own `ubuntu-latest` runner
// image (which ships Google Chrome preinstalled). Also covers the common macOS/Linux
// developer-machine defaults.
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

// A last-resort PATH lookup for a handful of common binary names. It covers a Chromium installed
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
 * Finds a real, usable Chrome/Chromium executable on this machine. `puppeteer-core` bundles no
 * browser of its own and requires one to be supplied explicitly. This module's own doc comment
 * explains why it's used in place of real `puppeteer`.
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
 * Resolves which pages to scan. The main site is always scanned. The docs/api/ landing page is
 * scanned too, but only once docs/api/ has actually been generated in this working tree
 * (`npm run docs:api`). It is normal for it to be absent in a bare local checkout that hasn't
 * run that script yet.
 * @returns Absolute paths of every page to scan.
 */
async function resolvePages() {
  const pages = [MAIN_SITE_PAGE]
  if (!(await pathExists(docsApiDir))) return pages

  if (!(await pathExists(API_LANDING_PAGE))) {
    throw new Error(`docs/api/ exists but its expected landing page ${API_LANDING_PAGE} does not.`)
  }
  pages.push(API_LANDING_PAGE)
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
      // support. Ubuntu 23.10+ (GitHub's `ubuntu-latest` runner) restricts
      // it via AppArmor. Without these flags Chrome exits immediately on
      // launch and pa11y produces no report at all. This is safe here:
      // every page this check ever loads is this repository's own static,
      // committed HTML over a file:// URL, never untrusted content.
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    }

    const existingPages = await resolvePages()

    const perPage = await Promise.all(
      existingPages.map(async (path) => {
        const result = await pa11y(pathToFileURL(path).href, { chromeLaunchConfig })
        // Attach the repo-relative page path to every issue. With more than one page scanned,
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
