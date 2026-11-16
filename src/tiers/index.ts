/**
 * Four tiers of checks, each a function that returns `checks` to spread into
 * `defineRepoContract`: `basic`, `app`, `library` and `strict`. Each tier holds every check of the
 * tier before it. One overrides object, keyed by check id, changes a check's options or turns it
 * off. `explainTier` and `renderExplain` say what a config runs and what it loosened.
 *
 * Built from `repo-contract/presets`, so Experimental like them. Published under its `./tiers`
 * subpath, independent of the other barrels.
 * @packageDocumentation
 */
export { app, basic, library, strict, tier } from "./tiers.js"
export {
  LIBRARY_ONLY_CHECKS,
  plannedChecks,
  TIER_NAMES,
  tierChecks,
  tierDefinition,
  tierSettings,
} from "./catalog.js"
export { explainTier, renderExplain, tierBaseline } from "./explain.js"
export { compareSetting, LOOSENING_RULES } from "./loosening.js"
export type {
  AppCheckId,
  BasicCheckId,
  LibraryCheckId,
  PlannedCheck,
  PlannedCheckId,
  StrictCheckId,
  TierCheck,
  TierCheckId,
  TierCheckOptions,
  TierChecks,
  TierConfig,
  TierDefinition,
  TierMetadata,
  TierName,
  TierOverrides,
  TierSettings,
} from "./types.js"
export type {
  ExplainableConfig,
  ExplainBaseline,
  ExplainedCheck,
  Loosening,
  RenderExplainOptions,
  TierExplanation,
} from "./explain.js"
export type { LooseningDirection, LooseningRule, SettingComparison } from "./loosening.js"
