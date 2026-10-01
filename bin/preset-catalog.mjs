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
// `distNoUrls` maps to `DIST_OUTPUT`, a pseudo-dependency: it needs no CLI at all, only a package that
// actually publishes a built `dist/`, so `detectPresets` detects it from package.json's own
// `main`/`module`/`types`/`files`/`exports` instead of from `devDependencies`.
//
// `securityDeps` maps to `null`, not a real npm package name: it shells out to `npm` itself (see
// GUIDE.md's preset table), which is always present because this script is already running via
// `npx`/`npm exec`. It goes through the exact same detection loop as every other preset below,
// with an always-true answer -- not a separate branch elsewhere.
/** The pseudo-dependency `distNoUrls` maps to -- see the comment above. */
export const DIST_OUTPUT = "dist/"

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
  distNoUrls: DIST_OUTPUT,
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
  "distNoUrls",
])

/**
 * Every string anywhere inside `value` (an `exports` map nests arbitrarily).
 * @param value - Any parsed JSON value.
 * @returns the strings it contains.
 */
function allStrings(value) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allStrings)
  return []
}

/**
 * Whether package.json publishes a built `dist/` directory (its entry points or `files` allowlist
 * name it).
 * @param packageJson - Parsed package.json content.
 * @returns `true` when any entry point or `files` entry is `dist` or lives under it.
 */
function publishesDist(packageJson) {
  const references = allStrings([
    packageJson.main,
    packageJson.module,
    packageJson.types,
    packageJson.files,
    packageJson.exports,
  ])
  return references.some((reference) => /^(\.\/)?dist(\/|$)/.test(reference))
}

/**
 * Detects which presets' underlying CLIs are already declared in a consumer's package.json.
 * Checks `devDependencies` only -- every published preset's own documentation (GUIDE.md's
 * presets table) already states its CLI "is already a devDependency of your repository"; a
 * production `dependencies` entry is not the documented, expected place to declare one.
 * @param packageJson - Parsed package.json content.
 * @returns detected preset names (in PRESET_DEPENDENCIES's declared order) and, for each skipped
 * preset, the dependency name that was missing.
 */
export function detectPresets(packageJson) {
  const declared = new Set(Object.keys(packageJson.devDependencies ?? {}))

  const detected = []
  const skipped = []

  for (const [preset, dependency] of Object.entries(PRESET_DEPENDENCIES)) {
    const present =
      dependency === null ||
      (dependency === DIST_OUTPUT ? publishesDist(packageJson) : declared.has(dependency))
    if (present) {
      detected.push(preset)
    } else {
      skipped.push({ preset, dependency })
    }
  }

  return { detected, skipped }
}
