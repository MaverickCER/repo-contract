// Entry point for repo-contract's `lint` check (see repo-contract.config.ts).
// Runs two independent static-analysis tools against the same source tree
// and combines their evidence into one JSON object:
//   - eslint: this repository's full, configured rule set (eslint.config.js).
//   - oxlint: oxc's Rust-based linter, a pinned devDependency (see
//     package.json) invoked via its own bin -- a second, independent opinion
//     using a different rule engine, not a replacement for ESLint's
//     project-specific config.
// Both auto-fix (`--fix`) before reporting; each tool reports only its own
// unfixed issues. Prints combined JSON evidence to stdout for the `lint`
// check's `output: { format: "json" }` to parse; everything else goes to
// stderr.
//
// Report-only: lint findings from either tool never fail this script's own
// process -- that judgment belongs entirely to the `lint` check's policy,
// which reads this same JSON evidence. Only a genuine tool-infrastructure
// failure (a tool crashing or producing unparseable output) fails it.

import spawn from "cross-spawn"

function runJsonTool(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] })

    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })

    child.once("error", (error) => {
      resolve({ ok: false, error: error.message })
    })
    child.once("close", () => {
      try {
        resolve({ ok: true, value: JSON.parse(stdout) })
      } catch (error) {
        resolve({ ok: false, error: `${command} did not produce valid JSON: ${error.message}` })
      }
    })
  })
}

// Sequential, NOT Promise.all: both tools run with `--fix`, so both hold write ownership of the
// same working tree. Run concurrently, one rewrites a file while the other is mid-read of it, and
// ESLint aborts without emitting any JSON -- the check then reports "eslint did not produce valid
// JSON: Unexpected end of JSON input" (a real, timing-dependent CI failure). Serializing the two
// fixers removes the race entirely; the extra few seconds is not worth the nondeterminism.
// test/integration/lint/no-concurrent-fixers.test.ts guards this ordering.
const eslint = await runJsonTool("eslint", [".", "--format", "json", "--fix"])
const oxlint = await runJsonTool("oxlint", [
  "--format",
  "json",
  "--fix",
  "--ignore-pattern=test/e2e/*/fixtures",
  ".",
])

process.stdout.write(JSON.stringify({ eslint, oxlint }))

process.exitCode = eslint.ok && oxlint.ok ? 0 : 1
