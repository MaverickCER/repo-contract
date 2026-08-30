import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.base.config.js"

// Execution boundary: test/unit/** only. Coverage thresholds are deliberately
// NOT declared here -- a single category's coverage was never meant to meet
// the whole-repo bar on its own; see scripts/report-coverage.mjs, which
// reports against the aggregate instead (repo-contract's `coverage` check is
// what actually gates it).
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "unit",
      include: ["test/unit/**/*.test.ts"],
      exclude: ["**/node_modules/**"],
      coverage: {
        provider: "v8",
        // Vitest's own default (false) skips writing any report at all when
        // this run has a failing test -- which previously made a single
        // failing unit/integration/property test surface, several steps
        // downstream, as coverage's own opaque "output could not be parsed
        // as JSON" (scripts/aggregate-coverage.mjs throws a clear "missing
        // coverage artifact" error when a category's coverage-final.json
        // never got written) instead of directly pointing at the test that
        // actually failed.
        reportOnFailure: true,
        include: ["src/**/*.ts"],
        // src/types.ts is interfaces/type aliases only -- erased entirely at
        // compile time (verbatimModuleSyntax), so it has no coverable runtime
        // statements at all.
        exclude: ["src/types.ts"],
        // Deliberately no "text" reporter here -- unlike every other
        // reporter below, "text" prints its ASCII table directly to stdout,
        // which would corrupt this category's --reporter=json test-results
        // output when both run together (as repo-contract's test-unit check
        // does). The aggregate step (scripts/aggregate-coverage.mjs) still
        // includes "text" for a human-readable summary once merged.
        reporter: ["html", "lcov", "json", "json-summary"],
        reportsDirectory: "coverage/unit",
      },
    },
  }),
)
