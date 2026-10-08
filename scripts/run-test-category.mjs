// Canonical implementation of "run verification category X" for every
// Vitest-based category (unit/integration/property/e2e). package.json's
// test:<category> scripts, repo-contract.config.ts's test-<category> checks,
// and scripts/run-coverage.mjs all invoke this one script rather than each
// separately re-encoding the same `vitest run --config ...` invocation --
// see specs/decisions/0005-independent-verification-boundaries-coverage-is-a-union.md for why
// that duplication was a real defect, not a stylistic one.
//
// Usage: node scripts/run-test-category.mjs <unit|integration|property|e2e> [--coverage] [--reporter=json]
//
// Every flag after the category name is passed through to vitest verbatim.
// stdio is fully inherited -- this script never writes anything of its own
// to stdout, so a caller parsing vitest's --reporter=json output (e.g. a
// repo-contract check) sees exactly vitest's own stdout, uncorrupted.
//
// One exception, for --reporter=json: as of Vitest 5 that reporter no longer prints the report to stdout --
// it writes a file of its own choosing and prints only a "JSON report written to ..." line -- and
// Vitest 4 with --outputFile writes the file alone. So this script has Vitest write the report to a fresh
// private temporary file and prints that file's contents to stdout once Vitest has exited. Vitest's own
// stdout (its "JSON report written to ..." notice, any coverage text) goes to stderr meanwhile, so stdout
// carries the report and nothing else. A caller that parses stdout therefore gets the report on either
// major, and can never read a stale one: the file is created for this run and removed after it.

import spawn from "cross-spawn"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const CATEGORIES = new Set(["unit", "integration", "property", "e2e"])

const [category, ...passthroughArgs] = process.argv.slice(2)

if (!category || !CATEGORIES.has(category)) {
  console.error(
    `[run-test-category] expected one of: ${[...CATEGORIES].join(", ")} -- got ${JSON.stringify(category)}`,
  )
  process.exit(1)
}

const configFile = `vitest.${category}.config.ts`

const wantsJsonOnStdout =
  passthroughArgs.includes("--reporter=json") &&
  !passthroughArgs.some((arg) => arg.startsWith("--outputFile"))
const reportDir = wantsJsonOnStdout
  ? mkdtempSync(path.join(tmpdir(), "run-test-category-"))
  : undefined
const reportFile = reportDir === undefined ? undefined : path.join(reportDir, "report.json")

const child = spawn(
  "vitest",
  [
    "run",
    "--config",
    configFile,
    ...passthroughArgs,
    ...(reportFile === undefined ? [] : [`--outputFile=${reportFile}`]),
  ],
  { cwd: root, stdio: wantsJsonOnStdout ? ["inherit", 2, "inherit"] : "inherit" },
)

// Prints the report Vitest wrote (see the header) and removes its private directory. A missing report --
// Vitest died before writing one -- prints nothing, which the caller reports as unparseable output.
function emitReport() {
  if (reportFile === undefined || reportDir === undefined) return
  try {
    process.stdout.write(readFileSync(reportFile, "utf8"))
  } catch {
    // no report was written
  } finally {
    rmSync(reportDir, { recursive: true, force: true })
  }
}

// Both handlers set `process.exitCode` and let the process end on its own instead of calling
// `process.exit()`: when stdout is a pipe (as it is under repo-contract's runner) a large report is written
// asynchronously, and `process.exit()` discards whatever has not been flushed, which turns a valid JSON
// report into a truncated, unparseable one.
child.once("error", (error) => {
  emitReport()
  console.error(`[run-test-category] failed to spawn vitest: ${error.message}`)
  process.exitCode = 1
})

child.once("exit", (code, signal) => {
  emitReport()
  process.exitCode = signal ? 1 : (code ?? 1)
})
