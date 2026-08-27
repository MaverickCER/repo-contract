// Entry point for repo-contract's `accessibility` check (see
// repo-contract.config.ts). Runs pa11y (WCAG2AA, its default standard)
// against the built docs/ landing page and prints its JSON report to
// stdout, matching the file-based-tool-output pattern the docs/markdownlint
// check already uses. pa11y drives a real headless Chromium page via
// puppeteer -- an actual accessibility tree, not static markup analysis --
// so contrast, focus order, and ARIA issues are caught the same way a real
// browser would surface them, confirmed by a real run against this page
// (see specs/decisions/0009-self-hosting-tool-and-dependency-choices.md).
//
// Tests docs/index.html directly via a file:// URL -- this page has no
// build step (unlike dist/), so nothing needs to run first.

import spawn from "cross-spawn"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsIndexPath = join(__dirname, "..", "docs", "index.html")
const targetUrl = pathToFileURL(docsIndexPath).href

const child = spawn("pa11y", [targetUrl, "--reporter", "json"], {
  stdio: ["ignore", "pipe", "inherit"],
})

let stdout = ""
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8")
})

child.once("error", (error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }))
  process.exitCode = 1
})

child.once("close", () => {
  try {
    const findings = JSON.parse(stdout)
    process.stdout.write(JSON.stringify({ ok: true, value: findings }))
    process.exitCode = 0
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: `pa11y did not produce valid JSON: ${error.message}` }),
    )
    process.exitCode = 1
  }
})
