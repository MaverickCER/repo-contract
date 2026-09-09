/**
 * This demo's own ESLint config -- deliberately minimal, and deliberately not
 * inherited from anywhere else, so the README's captured output stays stable
 * regardless of how this repository's own real ESLint config evolves.
 *
 * `no-console: "warn"` is set explicitly, on top of the recommended sets, so
 * `src/greet.ts`'s one `console.log` produces a *warning*, never an error --
 * that's the one deliberate, deterministic finding this demo exists to show.
 */
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "warn",
    },
  },
)
