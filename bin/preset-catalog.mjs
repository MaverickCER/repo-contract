// Fixed, hand-maintained table from each published preset (src/presets/index.ts) to the npm
// dependency its underlying CLI needs -- taken from GUIDE.md's own preset table. Deliberately not
// derived from metadata added to the preset modules themselves -- see
// specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md's 2026-09-09
// amendment, "Alternatives considered (amendment)": that would mean changing already-published
// preset modules for the sake of a scaffolding helper.
//
// test/unit/bin/preset-catalog.test.ts proves these *names* match src/presets/index.ts's exports
// -- it cannot prove each dependency mapping below is itself correct. That's a known, accepted
// limit of a hand-maintained table, stated here rather than assumed away.
//
// `securityDeps` maps to `null`, not a real npm package name: it shells out to `npm` itself (see
// GUIDE.md's preset table), which is always present because this script is already running via
// `npx`/`npm exec`. It goes through the exact same detection loop as every other preset below,
// with an always-true answer -- not a separate branch elsewhere.
export const PRESET_DEPENDENCIES = {
  test: "vitest",
  e2e: "@playwright/test",
  lint: "eslint",
  format: "prettier",
  typecheck: "typescript",
  deadCode: "knip",
  duplication: "jscpd",
  stylelint: "stylelint",
  markdownlint: "markdownlint-cli2",
  brokenLinks: "linkinator",
  securityDeps: null,
  securitySecrets: "secretlint",
  license: "licensee",
  commitlint: "@commitlint/cli",
  publint: "publint",
  arethetypeswrong: "@arethetypeswrong/cli",
}

// Presets published as factories (`lint(options?)`, `deadCode(options?)`, ...) -- the generated
// config must call these, not spread them bare, to match how GUIDE.md documents each one.
export const FACTORY_PRESETS = new Set([
  "lint",
  "deadCode",
  "duplication",
  "stylelint",
  "markdownlint",
  "brokenLinks",
  "commitlint",
])

/**
 * Detects which presets' underlying CLIs are already declared in a consumer's package.json.
 * @param packageJson - Parsed package.json content.
 * @returns detected preset names (in PRESET_DEPENDENCIES's declared order) and, for each skipped
 * preset, the dependency name that was missing.
 */
export function detectPresets(packageJson) {
  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ])

  const detected = []
  const skipped = []

  for (const [preset, dependency] of Object.entries(PRESET_DEPENDENCIES)) {
    if (dependency === null || declared.has(dependency)) {
      detected.push(preset)
    } else {
      skipped.push({ preset, dependency })
    }
  }

  return { detected, skipped }
}
