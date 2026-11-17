import type { PlannedCheck, TierCheckId, TierDefinition, TierName, TierSettings } from "./types.js"

/** The tier names, loosest first. */
export const TIER_NAMES: readonly TierName[] = ["basic", "app", "library", "strict"]

/** The checks that only matter to a package someone installs. On a `private: true` package they pass as not applicable. */
export const LIBRARY_ONLY_CHECKS: readonly TierCheckId[] = [
  "Packaging",
  "TypeResolution",
  "BundledDependencies",
  "QuickStart",
]

/**
 * What the coverage, duplication, crap and mutation presets judge when given no options. A tier
 * that does not change a setting keeps this value, and an override that sets a setting to
 * `undefined` falls back to it, as the preset does. test/unit/tiers/preset-settings.test.ts pins
 * it to the presets' real defaults.
 */
export const PRESET_SETTINGS: TierSettings = {
  Coverage: { lines: 80, statements: 80 },
  Duplication: { maxPercentage: 0 },
  Crap: { threshold: 30, maxComplexity: 20 },
  Mutation: { minScore: 80 },
}

const APP_SETTINGS: TierSettings = { ...PRESET_SETTINGS, Duplication: { maxPercentage: 2 } }

const DEFINITIONS: Readonly<Record<TierName, TierDefinition>> = {
  basic: {
    name: "basic",
    extends: undefined,
    adds: ["Format", "Lint", "Typecheck", "Tests", "SecuritySecrets", "SecurityDeps"],
    settings: PRESET_SETTINGS,
    planned: [],
  },
  app: {
    name: "app",
    extends: "basic",
    adds: ["Build", "DeadCode", "Duplication", "Licenses", "DocsLinks", "Coverage"],
    settings: APP_SETTINGS,
    planned: [
      {
        id: "DocsFragments",
        tier: "app",
        reason:
          "Every `#anchor` link resolves to a heading, because a broken anchor is a broken link.",
      },
      {
        id: "GithubActions",
        tier: "app",
        reason: "Every workflow file passes actionlint, and a repository with no workflows passes.",
      },
      {
        id: "GitHygiene",
        tier: "app",
        reason:
          "No tracked build output, no conflict markers and no import of an untracked file reach a commit.",
      },
    ],
  },
  library: {
    name: "library",
    extends: "app",
    adds: LIBRARY_ONLY_CHECKS,
    settings: APP_SETTINGS,
    planned: [
      {
        id: "PackedConsumer",
        tier: "library",
        reason:
          "Every entry point imports from the packed tarball, as an installing consumer would.",
      },
      {
        id: "EngineMatrix",
        tier: "library",
        reason:
          "The CI matrix tests the Node floor that `engines` promises, read from GitHub Actions.",
      },
    ],
  },
  strict: {
    name: "strict",
    extends: "library",
    // Mutation is declared last: it is an isolated barrier, so every other check finishes first.
    adds: ["Crap", "DistNoUrls", "DocsMarkdown", "Commits", "Mutation"],
    settings: {
      Coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
      Duplication: { maxPercentage: 0.75 },
      Crap: PRESET_SETTINGS.Crap,
      Mutation: PRESET_SETTINGS.Mutation,
    },
    planned: [
      {
        id: "Suppressions",
        tier: "strict",
        reason: "Every disabled lint rule, type error or test carries a written reason.",
      },
      {
        id: "SecurityDevDeps",
        tier: "strict",
        reason:
          "Development dependencies pass `npm audit` too, because dev tooling runs in CI with credentials.",
      },
      {
        id: "CleanCheckout",
        tier: "strict",
        reason:
          "A fresh checkout of the committed tree passes, which catches an untracked file before a push.",
      },
    ],
  },
}

/**
 * Each tier's own definition. A tier's full check list is its `adds` after every tier it extends.
 * @param name - the tier.
 * @returns its definition.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export function tierDefinition(name: TierName): TierDefinition {
  // `Object.hasOwn` keeps an inherited key such as "toString" from passing for a tier.
  if (!Object.hasOwn(DEFINITIONS, name)) {
    throw new TypeError(`Unknown tier "${name}". The tiers are ${TIER_NAMES.join(", ")}.`)
  }
  return DEFINITIONS[name]
}

/**
 * @param name - the tier.
 * @returns every check the tier turns on, the checks of the tiers below it first, in schedule order.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export function tierChecks(name: TierName): readonly TierCheckId[] {
  const definition = tierDefinition(name)
  const below = definition.extends === undefined ? [] : tierChecks(definition.extends)
  return [...below, ...definition.adds]
}

/**
 * A tier's setting for a check it does not run is that preset's own default: what the preset
 * judges when added by hand with no options.
 * @param name - the tier.
 * @returns the tier's default settings.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export function tierSettings(name: TierName): TierSettings {
  return tierDefinition(name).settings
}

/**
 * @param name - the tier.
 * @returns the planned checks at this tier and below.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export function plannedChecks(name: TierName): readonly PlannedCheck[] {
  const definition = tierDefinition(name)
  const below = definition.extends === undefined ? [] : plannedChecks(definition.extends)
  return [...below, ...definition.planned]
}
