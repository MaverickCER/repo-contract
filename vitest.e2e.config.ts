import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.base.config.js"

// Execution boundary: test/e2e/** only. Coverage is intentionally disabled --
// E2E exercises dist/ (the built, bundled artifact) in a separate subprocess,
// not instrumented src/ in-process, so V8 coverage collection here would
// never attribute to a source location and would misrepresent this
// category's role. See specs/verification-taxonomy.md's coverage-contribution
// matrix for the full reasoning.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "e2e",
      include: ["test/e2e/**/*.test.ts"],
      exclude: ["test/e2e/*/fixtures/**", "**/node_modules/**"],
      coverage: {
        enabled: false,
      },
    },
  }),
)
