// Entry point for `npm run test:architecture` and repo-contract's
// `architecture` check. Three independent, purely-static analyses, combined
// into one evidence object:
//   - dependencyGraph: dependency-cruiser's rules against src/**, checks/**,
//     and scripts/** (see .dependency-cruiser.cjs) -- does the production
//     module graph obey this repository's architectural constraints? All
//     three are passed as cruise roots (not just src/) so a rule whose
//     `from` targets checks/ or scripts/ (e.g.
//     checks-and-scripts-must-not-import-src-internals) can actually see
//     their own outbound edges -- dependency-cruiser only inspects a
//     directory's own import statements when it's reachable from a cruise
//     root, and nothing under src/ ever imports checks/ or scripts/ (that's
//     the one-directional invariant src-must-not-import-scripts enforces),
//     so neither would otherwise ever be visited at all.
//   - testCategoryBoundaries: scripts/check-test-boundaries.mjs -- does every
//     verification category's Vitest config stay inside its own directory?
//   - adrStructure: scripts/check-adr-structure.mjs -- does specs/decisions/
//     stay structurally well-formed (filename shape, no duplicate numbers,
//     required headings)?
//
// None executes application code or contributes runtime coverage. Prints
// combined JSON evidence to stdout for repo-contract's `output: { format:
// "json" }` to parse; everything else goes to stderr.
//
// Report-only: violations found by either analysis never fail this script's
// own process -- that judgment belongs entirely to repo-contract's
// `architecture` check policy, which reads this same JSON evidence. Only a
// genuine tool-infrastructure failure (dependency-cruiser crashing or
// producing unparseable output) fails it.

import spawn from "cross-spawn"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { checkAdrStructure } from "./check-adr-structure.mjs"
import { checkTestBoundaries } from "./check-test-boundaries.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runDependencyCruiser() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "depcruise",
      ["--config", ".dependency-cruiser.cjs", "--output-type", "json", "src", "checks", "scripts"],
      { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    )

    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })

    child.once("error", reject)
    child.once("close", () => {
      // dependency-cruiser exits non-zero when it finds error-severity
      // violations -- that's still a successful analysis with real JSON
      // output, not a tool-infrastructure failure, so the exit code is
      // intentionally not treated as this promise's success/failure signal.
      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`dependency-cruiser did not produce valid JSON: ${error.message}`))
      }
    })
  })
}

let dependencyGraph
try {
  const result = await runDependencyCruiser()
  dependencyGraph = {
    ok: true,
    modulesAnalyzed: result.summary.totalCruised,
    errorCount: result.summary.error,
    warnCount: result.summary.warn,
    infoCount: result.summary.info,
    violations: result.summary.violations.map((v) => ({
      from: v.from,
      to: v.to,
      rule: v.rule.name,
      severity: v.rule.severity,
      comment: v.comment,
    })),
  }
} catch (error) {
  // Tool-infrastructure failure (dependency-cruiser crashed / produced
  // unparseable output) -- distinct from "the rules found violations",
  // preserved through to the policy the same way ParsedOutput.success does
  // for every other check.
  dependencyGraph = { ok: false, error: error.message }
}

const testCategoryBoundaries = checkTestBoundaries()
const adrStructure = checkAdrStructure()

process.stdout.write(JSON.stringify({ dependencyGraph, testCategoryBoundaries, adrStructure }))

// All three analyses must have completed as genuine tool-infrastructure
// successes (violations found is still `ok: true` -- see each analysis's own
// doc comment above) for this script's own exit code to report success --
// previously this only reflected dependencyGraph.ok, so a standalone
// `npm run test:architecture` invocation could exit 0 even while
// testCategoryBoundaries or adrStructure had thrown an infrastructure error.
process.exitCode = dependencyGraph.ok && testCategoryBoundaries.ok && adrStructure.ok ? 0 : 1
