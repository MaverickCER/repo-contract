import { notImplemented } from "../not-implemented.js"
import type {
  AppCheckId,
  BasicCheckId,
  LibraryCheckId,
  StrictCheckId,
  TierCheckId,
  TierConfig,
  TierName,
  TierOverrides,
} from "./types.js"

/**
 * Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps: what every codebase with
 * source code needs.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @beta
 */
export function basic(overrides: TierOverrides<BasicCheckId> = {}): TierConfig<BasicCheckId> {
  return notImplemented("R1", overrides)
}

/**
 * `basic` plus Build, DeadCode, Duplication (2%), Licenses, DocsLinks and Coverage (80% of lines
 * and statements): what built, shipped and maintained code needs.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @beta
 */
export function app(overrides: TierOverrides<AppCheckId> = {}): TierConfig<AppCheckId> {
  return notImplemented("R1", overrides)
}

/**
 * `app` plus Packaging, TypeResolution, BundledDependencies and QuickStart: what keeps a package
 * working for the people who install it. On a `private: true` package these four pass as not
 * applicable.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @beta
 */
export function library(overrides: TierOverrides<LibraryCheckId> = {}): TierConfig<LibraryCheckId> {
  return notImplemented("R1", overrides)
}

/**
 * `library` plus Mutation (score 80, no unconfirmed Timeout), Crap (30, complexity 20),
 * DistNoUrls, DocsMarkdown and Commits. Coverage rises to 80% on all four metrics and Duplication
 * falls to 0.75%.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @beta
 */
export function strict(overrides: TierOverrides = {}): TierConfig<StrictCheckId> {
  return notImplemented("R1", overrides)
}

/**
 * Builds a tier chosen at run time, as `init --preset <tier>` and `explain` do.
 * @param name - the tier.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata.
 * @beta
 */
export function tier(name: TierName, overrides: TierOverrides = {}): TierConfig<TierCheckId> {
  return notImplemented("R1", name, overrides)
}
