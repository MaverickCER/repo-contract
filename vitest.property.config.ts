import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.base.config.js"

// Execution boundary: test/property/** only.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "property",
      include: ["test/property/**/*.test.ts"],
      exclude: ["**/node_modules/**"],
      coverage: {
        provider: "v8",
        // See vitest.unit.config.ts's comment on this same option.
        reportOnFailure: true,
        include: ["src/**/*.ts"],
        exclude: ["src/types.ts"],
        // No "text" reporter -- see vitest.unit.config.ts's comment.
        reporter: ["html", "lcov", "json", "json-summary"],
        reportsDirectory: "coverage/property",
      },
    },
  }),
)
