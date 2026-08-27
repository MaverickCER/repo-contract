/**
 * Curated, growing catalog of preset checks for tools common across
 * TypeScript/JavaScript repositories -- each preset encodes how to execute
 * and interpret a common tool, never a repository's definition of quality
 * (see specs/decisions/0005-public-surface-stays-narrow-no-cli-experimental-presets.md). Import a preset,
 * spread it into your own `checks` record, and override whatever you need
 * -- most often `policy`; a factory preset's options are the preferred way
 * to change what it executes, a direct `run` override is an escape hatch.
 * Never re-exported from the package root (`src/index.ts`) -- presets are
 * an opt-in extra, not part of the core execution/evidence/policy surface
 * those exports describe, and this barrel never re-exports anything from
 * there either; the two stay independent.
 * @packageDocumentation
 */
export { arethetypeswrong } from "./arethetypeswrong.js"
export { brokenLinks } from "./broken-links.js"
export { commitlint } from "./commitlint.js"
export { deadCode } from "./dead-code.js"
export { duplication } from "./duplication.js"
export { e2e } from "./e2e.js"
export { format } from "./format.js"
export { license } from "./license.js"
export { lint } from "./lint.js"
export { markdownlint } from "./markdownlint.js"
export { publint } from "./publint.js"
export { securityDeps } from "./security-deps.js"
export { securitySecrets } from "./security-secrets.js"
export { stylelint } from "./stylelint.js"
export { test } from "./test.js"
export { typecheck } from "./typecheck.js"
