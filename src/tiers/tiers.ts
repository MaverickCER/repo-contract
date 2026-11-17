import { arethetypeswrong } from "../presets/arethetypeswrong.js"
import { brokenLinks } from "../presets/broken-links.js"
import { bundledDependencies } from "../presets/bundled-dependencies.js"
import { commitlint } from "../presets/commitlint.js"
import { coverage, COVERAGE_VITEST_ARGS } from "../presets/coverage.js"
import type { CoverageOptions } from "../presets/coverage.js"
import { crap } from "../presets/crap.js"
import { deadCode } from "../presets/dead-code.js"
import { distNoUrls } from "../presets/dist-no-urls.js"
import { duplication } from "../presets/duplication.js"
import { format } from "../presets/format.js"
import { license } from "../presets/license.js"
import { lint } from "../presets/lint.js"
import { markdownlint } from "../presets/markdownlint.js"
import { mutation } from "../presets/mutation.js"
import { npmScript } from "../presets/npm-script.js"
import type { NpmScriptOptions } from "../presets/npm-script.js"
import { publint } from "../presets/publint.js"
import { quickStart } from "../presets/quick-start.js"
import { securityDeps } from "../presets/security-deps.js"
import { securitySecrets } from "../presets/security-secrets.js"
import { checkTerminatedAbnormally } from "../presets/shared/terminal-status.js"
import { test } from "../presets/test.js"
import { typecheck } from "../presets/typecheck.js"
import type { CheckDefinitionConfig } from "../types.js"
import {
  LIBRARY_ONLY_CHECKS,
  plannedChecks,
  PRESET_SETTINGS,
  tierChecks,
  tierSettings,
} from "./catalog.js"
import { passWhenPrivate } from "./not-applicable.js"
import type {
  AppCheckId,
  BasicCheckId,
  LibraryCheckId,
  StrictCheckId,
  TierCheckId,
  TierCheckOptions,
  TierConfig,
  TierName,
  TierOverrides,
  TierSettings,
} from "./types.js"

type Options = Readonly<Record<string, unknown>>

/** The checks whose options type is `never`: the only override they accept is `false`. */
type FixedCheckId = {
  [K in TierCheckId]: [TierCheckOptions[K]] extends [never] ? K : never
}[TierCheckId]

/** The checks a tier builds from options. */
type ConfigurableCheckId = Exclude<TierCheckId, FixedCheckId>

/** How a tier builds one check that takes options. */
interface Recipe {
  readonly build: (options: Options) => CheckDefinitionConfig
  /** The options the tier passes when no override replaces them. */
  readonly defaults: (settings: TierSettings) => Options
  /** Lays an override over the defaults when one level is not enough; otherwise the merge is shallow. */
  readonly merge?: (defaults: Options, override: Options) => Options
}

const RECIPES: Readonly<Record<ConfigurableCheckId, Recipe>> = {
  Lint: { build: lint, defaults: () => ({}) },
  SecurityDeps: {
    build: securityDeps,
    defaults: () => ({ registry: ".repo-contract/exceptions/security-deps.json" }),
  },
  // Isolated: every later reader of `dist` needs this build finished, and none of them overlaps it.
  Build: {
    build: (options) => ({ ...npmScript(options as unknown as NpmScriptOptions), isolated: true }),
    defaults: () => ({ script: "build", whenMissing: "skip" }),
  },
  DeadCode: { build: deadCode, defaults: () => ({}) },
  Duplication: {
    build: duplication,
    defaults: (settings) => ({ maxPercentage: settings.Duplication.maxPercentage }),
  },
  DocsLinks: {
    build: brokenLinks,
    defaults: () => ({
      start: [
        { path: "README.md", mode: "markdown" },
        { path: "docs", mode: "html" },
      ],
    }),
  },
  Coverage: {
    build: coverage,
    defaults: (settings) => ({ thresholds: settings.Coverage }),
    // Per metric, so `{ thresholds: { branches: 70 } }` keeps the other three.
    merge: (defaults, override) => ({
      ...defaults,
      ...override,
      thresholds: {
        ...(defaults as CoverageOptions).thresholds,
        ...(override as CoverageOptions).thresholds,
      },
    }),
  },
  TypeResolution: { build: arethetypeswrong, defaults: () => ({}) },
  QuickStart: { build: quickStart, defaults: () => ({}) },
  Crap: {
    build: crap,
    defaults: (settings) => ({
      threshold: settings.Crap.threshold,
      maxComplexity: settings.Crap.maxComplexity,
    }),
  },
  DistNoUrls: { build: distNoUrls, defaults: () => ({}) },
  DocsMarkdown: {
    build: markdownlint,
    // Explicit globs keep markdownlint out of node_modules, where a `**` glob runs out of memory.
    defaults: () => ({ globs: ["*.md", "docs/**/*.md"], verdict: "exit-code" }),
  },
  Commits: { build: commitlint, defaults: () => ({}) },
  // Isolated and last: Stryker's worker pool would contend with any check running beside it.
  Mutation: {
    build: (options) => ({ ...mutation(options), isolated: true }),
    defaults: (settings) => ({ minScore: settings.Mutation.minScore }),
  },
}

const DEPENDS_ON: Partial<Record<TierCheckId, readonly TierCheckId[]>> = {
  Coverage: ["Tests"],
  Crap: ["Coverage"],
}

// The format preset rewrites files; a gate must only report them.
const FORMAT_CHECK: CheckDefinitionConfig = { ...format, run: ["prettier", "--check", "."] }

const TESTS_WITH_COVERAGE: CheckDefinitionConfig = {
  ...test,
  run: [...(test.run as readonly string[]), ...COVERAGE_VITEST_ARGS],
}

const FIXED_CHECKS: Readonly<Record<FixedCheckId, CheckDefinitionConfig>> = {
  Format: FORMAT_CHECK,
  Typecheck: typecheck,
  Tests: test,
  SecuritySecrets: securitySecrets,
  Licenses: license,
  Packaging: publint,
  BundledDependencies: bundledDependencies,
}

/**
 * @param id - a check id.
 * @returns whether the check takes no options.
 */
function isFixed(id: TierCheckId): id is FixedCheckId {
  return Object.hasOwn(FIXED_CHECKS, id)
}

/**
 * A check the overrides turned off. It stays in `checks`, so the run shows it and every
 * `dependsOn` naming it still resolves, and it runs a no-op process instead of its tool.
 * @param id - the check id.
 * @param name - the tier, for the rationale.
 * @returns the turned-off check.
 */
function turnedOff(id: TierCheckId, name: TierName): CheckDefinitionConfig {
  return {
    run: ["node", "-e", ""],
    policy: ({ result }) =>
      checkTerminatedAbnormally(result, "node") ?? {
        outcome: "pass",
        rationale: `${id} is off: the ${name}() overrides set ${id}: false, so its tool did not run.`,
      },
  }
}

/**
 * @param value - one override value, not `undefined` and not `false`.
 * @param id - its check id, for the error.
 * @returns the value as an options object.
 * @throws {TypeError} when the value is not an options object, or the check takes no options.
 */
function overrideOptions(value: unknown, id: TierCheckId): Options {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`The ${id} override must be an options object or false.`)
  }
  if (isFixed(id)) {
    throw new TypeError(`${id} takes no options. Pass ${id}: false to turn it off.`)
  }
  return value as Options
}

/**
 * @param defaults - the tier's settings.
 * @param received - the options each built check received, keyed by id; `undefined` for a check
 * that takes none. A check the overrides left alone received options made from `defaults`.
 * @returns the settings in force. A check's setting comes from the options it received, or from
 * the preset's own default when an override sets it to `undefined`, as the preset reads it.
 */
function settingsInForce(
  defaults: TierSettings,
  received: Partial<Record<TierCheckId, Options | undefined>>,
): TierSettings {
  const coverageOptions = received.Coverage as TierCheckOptions["Coverage"] | undefined
  const duplicationOptions = received.Duplication as TierCheckOptions["Duplication"] | undefined
  const crapOptions = received.Crap as TierCheckOptions["Crap"] | undefined
  const mutationOptions = received.Mutation as TierCheckOptions["Mutation"] | undefined
  return {
    Coverage: { ...defaults.Coverage, ...coverageOptions?.thresholds },
    Duplication: duplicationOptions
      ? {
          maxPercentage:
            duplicationOptions.maxPercentage ?? PRESET_SETTINGS.Duplication.maxPercentage,
        }
      : defaults.Duplication,
    Crap: crapOptions
      ? {
          threshold: crapOptions.threshold ?? PRESET_SETTINGS.Crap.threshold,
          maxComplexity: crapOptions.maxComplexity ?? PRESET_SETTINGS.Crap.maxComplexity,
        }
      : defaults.Crap,
    Mutation: mutationOptions
      ? { minScore: mutationOptions.minScore ?? PRESET_SETTINGS.Mutation.minScore }
      : defaults.Mutation,
  }
}

/**
 * Builds one check that is not turned off.
 * @param id - the check id.
 * @param override - the override's options, or `undefined` for the tier's own.
 * @param settings - the tier's settings.
 * @param hasCoverage - whether the tier reads coverage, which the test run must then write.
 * @returns the check and, for a configurable check, the options it received.
 */
function buildCheck(
  id: TierCheckId,
  override: Options | undefined,
  settings: TierSettings,
  hasCoverage: boolean,
): { readonly check: CheckDefinitionConfig; readonly options?: Options } {
  if (isFixed(id)) {
    // Coverage and Crap read the reports this test run writes.
    return { check: id === "Tests" && hasCoverage ? TESTS_WITH_COVERAGE : FIXED_CHECKS[id] }
  }
  const recipe = RECIPES[id]
  const defaults = recipe.defaults(settings)
  const options =
    override === undefined
      ? defaults
      : (recipe.merge?.(defaults, override) ?? { ...defaults, ...override })
  return { check: recipe.build(options), options }
}

/**
 * Builds a tier: its checks in schedule order and the metadata `explain` reads back.
 * @param name - the tier.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the tier's config.
 * @throws {TypeError} on an unknown tier, overrides that are not an object, an override for a
 * check the tier lacks, or an override value that is neither `false` nor an options object the
 * check accepts.
 */
function buildTier<Id extends TierCheckId>(
  name: TierName,
  overrides: TierOverrides<Id>,
): TierConfig<Id> {
  const ids = tierChecks(name)
  const defaults = tierSettings(name)
  // A plain JavaScript config can pass anything. A string's indexes would read as unknown check ids.
  const shape: unknown = overrides
  if (typeof shape !== "object" || shape === null || Array.isArray(shape)) {
    throw new TypeError(`${name}() takes an object of overrides keyed by check id.`)
  }
  const given = shape as Readonly<Record<string, unknown>>
  const unknownId = Object.keys(given).find((key) => !ids.includes(key as TierCheckId))
  if (unknownId !== undefined) {
    throw new TypeError(`${name}() has no check "${unknownId}". Its checks are ${ids.join(", ")}.`)
  }

  const hasCoverage = ids.includes("Coverage")
  const checks: Record<string, CheckDefinitionConfig> = {}
  const received: Partial<Record<TierCheckId, Options | undefined>> = {}
  const off: TierCheckId[] = []
  for (const id of ids) {
    const value = given[id]
    if (value === false) {
      off.push(id)
      checks[id] = turnedOff(id, name)
      continue
    }
    const override = value === undefined ? undefined : overrideOptions(value, id)
    const built = buildCheck(id, override, defaults, hasCoverage)
    received[id] = built.options
    const dependsOn = DEPENDS_ON[id]
    const check = dependsOn === undefined ? built.check : { ...built.check, dependsOn }
    checks[id] = LIBRARY_ONLY_CHECKS.includes(id) ? passWhenPrivate(id, check) : check
  }

  return {
    checks: checks as unknown as TierConfig<Id>["checks"],
    tier: {
      name,
      overrides,
      checks: ids,
      off,
      settings: settingsInForce(defaults, received),
      planned: plannedChecks(name),
    },
  }
}

/**
 * Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps: what every codebase with
 * source code needs.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export function basic(overrides: TierOverrides<BasicCheckId> = {}): TierConfig<BasicCheckId> {
  return buildTier("basic", overrides)
}

/**
 * `basic` plus Build, DeadCode, Duplication (2%), Licenses, DocsLinks and Coverage (80% of lines
 * and statements): what built, shipped and maintained code needs. Tests also writes the coverage
 * reports Coverage reads.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export function app(overrides: TierOverrides<AppCheckId> = {}): TierConfig<AppCheckId> {
  return buildTier("app", overrides)
}

/**
 * `app` plus Packaging, TypeResolution, BundledDependencies and QuickStart: what keeps a package
 * working for the people who install it. On a `private: true` package these four pass as not
 * applicable.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export function library(overrides: TierOverrides<LibraryCheckId> = {}): TierConfig<LibraryCheckId> {
  return buildTier("library", overrides)
}

/**
 * `library` plus Crap (30, complexity 20), DistNoUrls, DocsMarkdown, Commits and Mutation (score
 * 80, no unconfirmed Timeout). Coverage rises to 80% on all four metrics and Duplication falls to
 * 0.75%.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, or an override that is neither
 * `false` nor an options object the check accepts.
 * @beta
 */
export function strict(overrides: TierOverrides = {}): TierConfig<StrictCheckId> {
  return buildTier("strict", overrides)
}

/**
 * Builds a tier chosen at run time, as `init --preset <tier>` and `explain` do.
 * @param name - the tier.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata.
 * @throws {TypeError} on an unknown tier, overrides that are not an object, an override for a
 * check the tier lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export function tier(name: TierName, overrides: TierOverrides = {}): TierConfig<TierCheckId> {
  return buildTier(name, overrides)
}
