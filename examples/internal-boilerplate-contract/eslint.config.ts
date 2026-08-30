/**
 * The organization's baseline ESLint configuration.
 *
 * Consumers EXTEND it, they do not copy it:
 *
 *   import baseline from "internal-boilerplate-contract/eslint"
 *   export default [...baseline, { rules: { ... } }]
 *
 * Kept deliberately small: the two well-known recommended sets as a flat-config
 * array a project can append its own blocks to.
 *
 * Non-type-checked on purpose. `recommendedTypeChecked` would require every
 * consumer to wire `parserOptions.projectService` and a tsconfig, which defeats
 * "extend the baseline in one line."
 */
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // These are Node projects, so declare the Node globals. For .ts files
    // typescript-eslint already turns off the core `no-undef` (tsc covers it);
    // this keeps plain .js files (config files, scripts) from tripping it.
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
