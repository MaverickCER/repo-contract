/**
 * repo-contract's core: write a repository's quality rules as one typed contract, run it, and read
 * the result. `defineRepoContract` types the config, `runRepoContract` runs every check and its
 * policy, and `serializeRun` and `renderMarkdownSummary` turn the result into JSON or Markdown.
 * The `Evidence`, `Verdict` and `Policy` types and the error classes complete the surface.
 *
 * Execution, parsing and policy internals (src/execution/, src/parsing/, src/policy/) stay
 * unexported, so they can change without a breaking release.
 * @packageDocumentation
 */

export { defineRepoContract } from "./config/define-repo-contract.js"
export { runRepoContract } from "./run-repo-contract.js"
export { renderMarkdownSummary, serializeRun } from "./report/render-summary.js"
export type { RenderMarkdownSummaryOptions } from "./report/render-summary.js"

export {
  DependencyDeclaredLaterError,
  InvalidCheckConfigError,
  InvalidRepoContractConfigError,
  PolicyReadFailedParseValueError,
  PolicyReadUnrequestedOutputError,
  PolicyThrewError,
  RepoContractError,
  StandardSchemaValidateThrewError,
  UnknownCheckIdError,
} from "./errors.js"

export type { StandardSchemaV1 } from "./standard-schema/types.js"

export type {
  CheckDefinition,
  CheckDefinitionConfig,
  CheckEvidence,
  CheckSchema,
  CheckStatus,
  Evidence,
  OutputFormat,
  ParsedOutput,
  ParsedOutputFailure,
  ParsedOutputSuccess,
  Policy,
  PolicyContext,
  PolicyOutcome,
  PolicyResult,
  RepoContractConfig,
  RunRepoContractOptions,
  Spawner,
  SyncSpawner,
  ValidatedCheckSchema,
  Verdict,
} from "./types.js"
