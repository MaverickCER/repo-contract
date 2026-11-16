import type { ArethetypeswrongOptions } from "../presets/arethetypeswrong.js"
import type { BrokenLinksOptions } from "../presets/broken-links.js"
import type { commitlint } from "../presets/commitlint.js"
import type { CoverageOptions } from "../presets/coverage.js"
import type { CrapOptions } from "../presets/crap.js"
import type { deadCode } from "../presets/dead-code.js"
import type { DistNoUrlsOptions } from "../presets/dist-no-urls.js"
import type { DuplicationOptions } from "../presets/duplication.js"
import type { lint } from "../presets/lint.js"
import type { MarkdownlintOptions } from "../presets/markdownlint.js"
import type { MutationOptions } from "../presets/mutation.js"
import type { NpmScriptOptions } from "../presets/npm-script.js"
import type { QuickStartOptions } from "../presets/quick-start.js"
import type { SecurityDepsOptions } from "../presets/security-deps.js"
import type { CheckDefinitionConfig } from "../types.js"

/** The four tiers, loosest first. Each tier holds every check of the tier before it. */
export type TierName = "basic" | "app" | "library" | "strict"

/** The checks `basic` turns on: what every codebase with source code needs. */
export type BasicCheckId =
  "Format" | "Lint" | "Typecheck" | "Tests" | "SecuritySecrets" | "SecurityDeps"

/** The checks `app` turns on: `basic` plus what built, shipped and maintained code needs. */
export type AppCheckId =
  BasicCheckId | "Build" | "DeadCode" | "Duplication" | "Licenses" | "DocsLinks" | "Coverage"

/** The checks `library` turns on: `app` plus what keeps a package working for the people who install it. */
export type LibraryCheckId =
  AppCheckId | "Packaging" | "TypeResolution" | "BundledDependencies" | "QuickStart"

/** The checks `strict` turns on: `library` plus general rigor that costs time. */
export type StrictCheckId =
  LibraryCheckId | "Mutation" | "Crap" | "DistNoUrls" | "DocsMarkdown" | "Commits"

/** Every check id a tier can turn on. The ids are PascalCase so a stricter config can replace one by id. */
export type TierCheckId = StrictCheckId

/** General checks a tier will turn on in a later minor release. `explain` lists them so no tier looks more complete than it is. */
export type PlannedCheckId =
  | "DocsFragments"
  | "GithubActions"
  | "GitHygiene"
  | "PackedConsumer"
  | "EngineMatrix"
  | "Suppressions"
  | "SecurityDevDeps"
  | "CleanCheckout"

/**
 * What each check accepts in a tier's overrides object. `never` means the check takes no options,
 * so the only override is `false`.
 */
export interface TierCheckOptions {
  readonly Format: never
  readonly Lint: NonNullable<Parameters<typeof lint>[0]>
  readonly Typecheck: never
  readonly Tests: never
  readonly SecuritySecrets: never
  readonly SecurityDeps: SecurityDepsOptions
  readonly Build: Partial<NpmScriptOptions>
  readonly DeadCode: NonNullable<Parameters<typeof deadCode>[0]>
  readonly Duplication: DuplicationOptions
  readonly Licenses: never
  readonly DocsLinks: BrokenLinksOptions
  readonly Coverage: CoverageOptions
  readonly Packaging: never
  readonly TypeResolution: ArethetypeswrongOptions
  readonly BundledDependencies: never
  readonly QuickStart: QuickStartOptions
  readonly Mutation: MutationOptions
  readonly Crap: CrapOptions
  readonly DistNoUrls: DistNoUrlsOptions
  readonly DocsMarkdown: MarkdownlintOptions
  readonly Commits: NonNullable<Parameters<typeof commitlint>[0]>
}

/**
 * The one overrides object a tier takes, keyed by check id. Options replace the tier's options for
 * that check. `false` turns the check off: it stays in the config and passes with a rationale that
 * names the override, so the run still shows it.
 */
export type TierOverrides<Id extends TierCheckId = TierCheckId> = {
  readonly [K in Id]?: TierCheckOptions[K] | false
}

/**
 * One check as a tier builds it. `dependsOn` is narrowed to the tier's other ids, which is what
 * lets `defineRepoContract` accept a spread tier.
 */
export type TierCheck<Dependency extends string> = CheckDefinitionConfig & {
  readonly dependsOn?: readonly Dependency[]
}

/** Every check of a tier, keyed by id, in schedule order. */
export type TierChecks<Id extends TierCheckId> = {
  readonly [K in Id]: TierCheck<Exclude<Id, K>>
}

/** The numeric settings `explain` compares against a baseline. */
export interface TierSettings {
  /** Minimum coverage per metric. A metric left out is not judged. */
  readonly Coverage: {
    readonly lines?: number
    readonly statements?: number
    readonly functions?: number
    readonly branches?: number
  }
  /** The largest duplicated share of scanned lines, in percent. */
  readonly Duplication: { readonly maxPercentage: number }
  /** The CRAP ceiling and the cyclomatic-complexity ceiling per function. */
  readonly Crap: { readonly threshold: number; readonly maxComplexity: number }
  /** The lowest mutation score that passes, in percent. */
  readonly Mutation: { readonly minScore: number }
}

/** A check a tier will turn on later, with the tier it belongs to and why it waits. */
export interface PlannedCheck {
  readonly id: PlannedCheckId
  readonly tier: TierName
  readonly reason: string
}

/** One tier's own definition: what it adds to the tier it extends, and its default settings. */
export interface TierDefinition {
  readonly name: TierName
  /** The tier this one builds on; `undefined` for `basic`. */
  readonly extends: TierName | undefined
  /** The checks this tier adds, in schedule order. */
  readonly adds: readonly TierCheckId[]
  /** The default settings at this tier. */
  readonly settings: TierSettings
  /** The planned checks that belong to this tier. */
  readonly planned: readonly PlannedCheck[]
}

/**
 * What a tier records about itself. It rides along on the config as `tier`, which
 * `validateRepoContractConfig` ignores, so `explain` can read it back.
 */
export interface TierMetadata {
  readonly name: TierName
  /** The overrides object exactly as passed. */
  readonly overrides: TierOverrides
  /** The ids the tier put in `checks`, in schedule order, turned-off ones included. */
  readonly checks: readonly TierCheckId[]
  /** The ids the overrides turned off. */
  readonly off: readonly TierCheckId[]
  /** The settings in force: the tier's defaults with the overrides applied. */
  readonly settings: TierSettings
  /** Planned checks at this tier and below. */
  readonly planned: readonly PlannedCheck[]
}

/** What a tier function returns. Spread it into `defineRepoContract` next to `spawn` and `env`. */
export interface TierConfig<Id extends TierCheckId> {
  readonly checks: TierChecks<Id>
  readonly tier: TierMetadata
}
