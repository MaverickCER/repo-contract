/**
 * Public API of repo-contract. Curated barrel -- internal implementation
 * modules (src/execution/, src/parsing/, src/policy/, src/config/'s
 * lower-level pieces) are not re-exported here even though they exist as
 * real files; only the two functions and the types a consumer needs to
 * author a config and interpret its result are part of the public surface.
 * @packageDocumentation
 */

export { defineRepoContract } from "./config/define-repo-contract.js"
export { runRepoContract } from "./run-repo-contract.js"

export {
  DependencyDeclaredLaterError,
  InvalidCheckConfigError,
  InvalidRepoContractConfigError,
  ParserDependencyMissingError,
  PolicyReadFailedParseValueError,
  PolicyReadUnrequestedOutputError,
  PolicyThrewError,
  RepoContractError,
  UnknownCheckIdError,
} from "./errors.js"

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
  ValidatedCheckSchema,
  Verdict,
} from "./types.js"
