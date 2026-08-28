// Entry point for repo-contract's `accessibility` check (see
// repo-contract.config.ts). Runs pa11y (WCAG2AA, its default standard)
// against the built docs/ landing page and prints a
// `{ ok, value | error }` result to stdout, matching the
// file-based-tool-output pattern the docs/markdownlint check already uses.
// pa11y drives a real headless Chromium page via puppeteer -- an actual
// accessibility tree, not static markup analysis -- so contrast, focus
// order, and ARIA issues are caught the same way a real browser would
// surface them, confirmed by a real run against this page (see
// specs/decisions/0009-self-hosting-tool-and-dependency-choices.md).
//
// Tests docs/index.html directly via a file:// URL -- this page has no
// build step (unlike dist/), so nothing needs to run first.
//
// pa11y is driven through its Node API rather than its CLI: the CLI cannot
// pass `chromeLaunchConfig` (needed for `--no-sandbox` below), and it also
// forced this script to re-parse the CLI's own stdout as JSON, which turned
// any Chromium launch failure into a misleading "Unexpected end of JSON
// input" instead of the real error. The API returns the findings directly
// and lets a genuine failure surface as a thrown Error with a usable
// message.

import pa11y from "pa11y"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsIndexPath = join(__dirname, "..", "docs", "index.html")
const targetUrl = pathToFileURL(docsIndexPath).href

try {
  const result = await pa11y(targetUrl, {
    // Chromium's own sandbox needs kernel unprivileged-user-namespace
    // support, which Ubuntu 23.10+ (GitHub's `ubuntu-latest` runner)
    // restricts via AppArmor -- without these flags the bundled Chromium
    // exits immediately on launch and pa11y produces no report at all. Safe
    // here: the only page this check ever loads is this repository's own
    // static docs/index.html over a file:// URL, never untrusted content.
    chromeLaunchConfig: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  })
  process.stdout.write(JSON.stringify({ ok: true, value: result.issues }))
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
