// Fixed, hand-maintained table from each published preset (src/presets/index.ts) to the npm
// dependency its underlying CLI needs. It is taken from GUIDE.md's own preset table. It is not
// derived from metadata added to the preset modules themselves. That would change
// already-published preset modules for the sake of a scaffolding helper. See the 2026-09-09
// amendment of specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md,
// "Alternatives considered (amendment)".
//
// test/unit/bin/preset-catalog.test.ts proves these *names* match src/presets/index.ts's exports.
// test/unit/docs/guide-presets.test.ts proves each mapping, and FACTORY_PRESETS, match GUIDE.md's
// table. Neither proves a mapping names the package that really ships the preset's CLI. That is
// the accepted limit of a hand-maintained table.
//
// `distNoUrls` maps to `DIST_OUTPUT`, a pseudo-dependency. It needs no CLI at all, only a package
// that publishes a built `dist/`. So `detectPresets` detects it from package.json's own
// `main`/`module`/`types`/`files`/`exports` instead of from `devDependencies`.
//
// `securityDeps` maps to `null`, not a real npm package name. It shells out to `npm` itself (see
// GUIDE.md's preset table). `npm` is always present, because this script already runs via
// `npx`/`npm exec`. It goes through the same detection loop as every other preset below, with an
// always-true answer, not a separate branch elsewhere.
//
// `aiReview` maps to `AGENT_COMMAND`, a pseudo-dependency that is never detected. The preset runs
// the agent a consumer names in its required `agent` option, so `init` has no command to write for
// it. It is listed under "Not detected" with a pointer to GUIDE.md instead.
/** The pseudo-dependency `distNoUrls` maps to: see the comment above. */
export const DIST_OUTPUT = "dist/"

/** The pseudo-dependency `aiReview` maps to: see the comment above. */
export const AGENT_COMMAND = "agent command"

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
  aiReview: AGENT_COMMAND,
}

// Presets published as factories (`lint(options?)`, `deadCode(options?)`, ...): the generated
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
  "aiReview",
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
 * Checks `devDependencies` only: every published preset's own documentation (GUIDE.md's
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
      (dependency === DIST_OUTPUT
        ? publishesDist(packageJson)
        : dependency !== AGENT_COMMAND && declared.has(dependency))
    if (present) {
      detected.push(preset)
    } else {
      skipped.push({ preset, dependency })
    }
  }

  return { detected, skipped }
}
