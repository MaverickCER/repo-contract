// Canonical implementation of "run verification category X" for every
// Vitest-based category (unit/integration/property/e2e). package.json's
// test:<category> scripts, repo-contract.config.ts's test-<category> checks,
// and scripts/run-coverage.mjs all invoke this one script rather than each
// separately re-encoding the same `vitest run --config ...` invocation --
// see specs/decisions/0006-independent-verification-boundaries-coverage-is-a-union.md for why
// that duplication was a real defect, not a stylistic one.
//
// Usage: node scripts/run-test-category.mjs <unit|integration|property|e2e> [--coverage] [--reporter=json]
//
// Every flag after the category name is passed through to vitest verbatim.
// stdio is fully inherited -- this script never writes anything of its own
// to stdout, so a caller parsing vitest's --reporter=json output (e.g. a
// repo-contract check) sees exactly vitest's own stdout, uncorrupted.

import spawn from "cross-spawn"
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

const child = spawn("vitest", ["run", "--config", configFile, ...passthroughArgs], {
  cwd: root,
  stdio: "inherit",
})

child.once("error", (error) => {
  console.error(`[run-test-category] failed to spawn vitest: ${error.message}`)
  process.exit(1)
})

child.once("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1))
})
