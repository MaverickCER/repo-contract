// Fixed, hand-maintained table from each published preset (src/presets/index.ts) to the npm
// dependency its underlying CLI needs. It is taken from GUIDE.md's preset table. It is not
// derived from metadata added to the preset modules themselves. That would change
// already-published preset modules for the sake of a scaffolding helper. See the 2026-09-09
// amendment of specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md,
// "Alternatives considered (amendment)".
//
// test/unit/bin/preset-catalog.test.ts proves these *names* match src/presets/index.ts's exports.
// test/unit/docs/guide-presets.test.ts proves each mapping, and FACTORY_PRESETS, match GUIDE.md's
// table. Neither proves a mapping names the package that ships the preset's CLI. That is
// the accepted limit of a hand-maintained table.
//
// `distNoUrls` maps to `DIST_OUTPUT`, a pseudo-dependency. It needs no CLI at all, only a package
// that publishes a built `dist/`. So `detectPresets` detects it from package.json's
// `main`/`module`/`types`/`files`/`exports` instead of from `devDependencies`.
//
// `securityDeps` maps to `null`, not an npm package name. It shells out to `npm` itself (see
// GUIDE.md's preset table). `npm` is always present, because this script already runs via
// `npx`/`npm exec`. It goes through the same detection loop as every other preset below, with an
// always-true answer, not a separate branch elsewhere.
//
// `aiReview` maps to `AGENT_COMMAND`, a pseudo-dependency that is never detected. The preset runs
// the agent a consumer names in its required `agent` option, so `init` has no command to write for
// it. It is listed under "Not detected" with a pointer to GUIDE.md instead.
//
// `bundledDependencies` maps to `PUBLISHED_PACKAGE`, a pseudo-dependency. It needs no CLI, and it
// guards what npm publishes, so `detectPresets` detects it for every package.json not marked
// `"private": true`, the same way publishing checks are on for every published package.
//
// `quickStart` maps to `QUICK_START_BLOCK`, a pseudo-dependency that is never detected. It runs
// the commands of a README block the consumer marks, so `init` cannot tell it is wanted.
//
// `sbom` maps to `NPM_LOCKFILE`, a pseudo-dependency that is never detected. It needs no CLI, only
// `package-lock.json`, but it fails until the consumer has written and committed the SBOM
// documents, so adding it to a fresh config would fail the first run.
/** The pseudo-dependency `distNoUrls` maps to: see the comment above. */
export const DIST_OUTPUT = "dist/"

/** The pseudo-dependency `aiReview` maps to: see the comment above. */
export const AGENT_COMMAND = "agent command"

/** The pseudo-dependency `bundledDependencies` maps to: see the comment above. */
export const PUBLISHED_PACKAGE = "published package"

/** The pseudo-dependency `quickStart` maps to: see the comment above. */
export const QUICK_START_BLOCK = "quick-start block"

/** The pseudo-dependency `sbom` maps to: see the comment above. */
export const NPM_LOCKFILE = "npm lockfile"

/** The pseudo-dependency `npmScript` maps to. It runs a script the consumer names, so `init` cannot tell which. */
export const NPM_SCRIPT = "npm script"

/** Pseudo-dependencies `init` never detects: the consumer opts in by writing the check. */
const NEVER_DETECTED = new Set([AGENT_COMMAND, QUICK_START_BLOCK, NPM_LOCKFILE, NPM_SCRIPT])

// Flat `init` leaves these to tiers. Coverage reads the reports a test run writes only when Tests
// gets the coverage flags, Crap reads Coverage's, and Mutation must run alone. A tier wires all
// three; a flat config would need a second, hand-written copy of that wiring.
/** Presets flat `init` never adds: `init --preset app` adds coverage, `--preset strict` all three. */
export const TIER_ONLY_PRESETS = new Set(["coverage", "crap", "mutation"])

/** The tier names `init --preset` accepts, loosest first. A unit test pins them to repo-contract/tiers. */
export const TIER_PRESET_NAMES = ["basic", "app", "library", "strict"]

/** The preset behind each tier check id, so `init --preset` can name a tier's missing tools. */
export const TIER_CHECK_PRESETS = {
  Format: "format",
  Lint: "lint",
  Typecheck: "typecheck",
  Tests: "test",
  SecuritySecrets: "securitySecrets",
  SecurityDeps: "securityDeps",
  Build: "npmScript",
  DeadCode: "deadCode",
  Duplication: "duplication",
  Licenses: "license",
  DocsLinks: "brokenLinks",
  Coverage: "coverage",
  Packaging: "publint",
  TypeResolution: "arethetypeswrong",
  BundledDependencies: "bundledDependencies",
  QuickStart: "quickStart",
  Crap: "crap",
  DistNoUrls: "distNoUrls",
  DocsMarkdown: "markdownlint",
  Commits: "commitlint",
  Mutation: "mutation",
}

/** Dependencies that are not npm packages a consumer installs. */
const PSEUDO_DEPENDENCIES = new Set([
  DIST_OUTPUT,
  AGENT_COMMAND,
  PUBLISHED_PACKAGE,
  QUICK_START_BLOCK,
  NPM_LOCKFILE,
  NPM_SCRIPT,
])

/**
 * The tier checks whose tool is not a devDependency, so `init --preset` can say what to install.
 * @param checkIds - The tier's check ids, in run order.
 * @param packageJson - Parsed package.json content.
 * @returns One entry per check with a missing npm tool, in `checkIds` order.
 */
export function missingTierTools(checkIds, packageJson) {
  const declared = new Set(Object.keys(packageJson.devDependencies ?? {}))
  return checkIds.flatMap((check) => {
    const preset = Object.hasOwn(TIER_CHECK_PRESETS, check) ? TIER_CHECK_PRESETS[check] : undefined
    const dependency = preset === undefined ? null : PRESET_DEPENDENCIES[preset]
    if (dependency === null || PSEUDO_DEPENDENCIES.has(dependency)) return []
    return packagesOf(dependency)
      .filter((name) => !declared.has(name))
      .map((name) => ({ check, preset, dependency: name }))
  })
}

/**
 * @param dependency - One PRESET_DEPENDENCIES value that names npm packages.
 * @returns The packages, as a list even when there is one.
 */
function packagesOf(dependency) {
  return Array.isArray(dependency) ? dependency : [dependency]
}

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
  bundledDependencies: PUBLISHED_PACKAGE,
  securityDeps: null,
  securitySecrets: "secretlint",
  license: "licensee",
  commitlint: "@commitlint/cli",
  publint: "publint",
  arethetypeswrong: "@arethetypeswrong/cli",
  aiReview: AGENT_COMMAND,
  quickStart: QUICK_START_BLOCK,
  sbom: NPM_LOCKFILE,
  coverage: "@vitest/coverage-v8",
  crap: "@danibram/crap4ts",
  // strykerConfig() sets testRunner "vitest", which Stryker loads only from its runner plugin.
  mutation: ["@stryker-mutator/core", "@stryker-mutator/vitest-runner"],
  npmScript: NPM_SCRIPT,
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
  "quickStart",
  "sbom",
  "arethetypeswrong",
  "securityDeps",
  "coverage",
  "crap",
  "mutation",
  "npmScript",
])

/**
 * Every value anywhere inside `value` that is not an object or array. An `exports` map nests
 * arbitrarily, and an array's values are its items.
 * @param value - Any parsed JSON value.
 * @returns the strings, numbers, booleans and nulls it contains.
 */
function leavesOf(value) {
  return value !== null && typeof value === "object"
    ? Object.values(value).flatMap(leavesOf)
    : [value]
}

/**
 * Whether package.json publishes a built `dist/` directory (its entry points or `files` allowlist
 * name it).
 * @param packageJson - Parsed package.json content.
 * @returns `true` when any entry point or `files` entry is `dist` or lives under it.
 */
function publishesDist(packageJson) {
  const references = leavesOf([
    packageJson.main,
    packageJson.module,
    packageJson.types,
    packageJson.files,
    packageJson.exports,
  ])
  // Only a string can read as dist: no number, boolean or null converts to one that does.
  return references.some((reference) => /^(\.\/)?dist(\/|$)/.test(String(reference)))
}

/**
 * Detects which presets' underlying CLIs are already declared in a consumer's package.json.
 * Checks `devDependencies` only. GUIDE.md's presets table says each preset's CLI "is already a
 * devDependency of your repository". A production `dependencies` entry is not the documented
 * place to declare one.
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
        : dependency === PUBLISHED_PACKAGE
          ? packageJson.private !== true
          : !NEVER_DETECTED.has(dependency) &&
            !TIER_ONLY_PRESETS.has(preset) &&
            // Each preset flat init adds needs one package; Mutation's two are a tier's to name.
            declared.has(dependency))
    if (present) {
      detected.push(preset)
    } else {
      skipped.push({ preset, dependency })
    }
  }

  return { detected, skipped }
}
