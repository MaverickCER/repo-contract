import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.base.config.js"

/**
 * Dev-convenience aggregate, NOT a verification category of its own --
 * powers `npm run test:watch` (and is Stryker's default test target, since
 * stryker.config.mjs names no vitest config explicitly) by watching
 * unit+integration+property together. e2e is intentionally excluded (slow:
 * real `npm pack`/`npm install`, painful to rerun on every save) and
 * architecture is excluded entirely (not a Vitest category at all -- see
 * `npm run test:architecture`).
 *
 * Every independently-executable category has its own dedicated config
 * (vitest.unit.config.ts, vitest.integration.config.ts,
 * vitest.property.config.ts, vitest.e2e.config.ts) driven through
 * scripts/run-test-category.mjs -- this file never replaces those, and
 * deliberately carries no coverage thresholds (aggregate threshold
 * enforcement lives in repo-contract's `coverage` check against the merged
 * coverage artifact, not any single Vitest invocation -- scripts/report-
 * coverage.mjs prints the same comparison for the standalone workflow, but
 * doesn't itself fail on it).
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "test/unit/**/*.test.ts",
        "test/integration/**/*.test.ts",
        "test/property/**/*.test.ts",
      ],
      exclude: ["**/node_modules/**"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts"],
        exclude: ["src/types.ts"],
        reporter: ["text", "html", "lcov", "json", "json-summary"],
      },
    },
  }),
)
