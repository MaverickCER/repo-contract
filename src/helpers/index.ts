/**
 * Governed exceptions: let a check waive one finding when a named record justifies it, without
 * weakening the check. A record names its `{ group, category }`, and this barrel resolves that to
 * a policy (exact, then glob, then default) and checks the record's fields against it.
 *
 * The check stays in charge of everything else. It decides what a finding is, matches records to
 * findings and owns the identity of each finding (see `scripts/shared/`, unpublished). This is the
 * mechanism `scripts/suppression-governance/` built for `disable-comments.json` (ADR 0006),
 * extracted for any check; specs/decisions/0013-reusable-exception-policy-helper.md has the
 * boundary.
 *
 * Published **Stable** (see `VERSIONING.md` and
 * specs/decisions/0019-helpers-promoted-presets-stay-experimental.md). From `1.0` a new export is
 * a minor release and a changed signature or behavior is a major one. While the package is `0.x`,
 * the release tooling deflates a new export to a patch.
 *
 * Published under its `./helpers` subpath, independent of the root and `./presets` barrels.
 * @packageDocumentation
 */
export type {
  ExceptionCategoryGroup,
  ExceptionClassification,
  ExceptionDeterminant,
  ExceptionPolicy,
  ExceptionPolicyConfig,
  ExceptionRecordEvaluation,
  ExceptionVerdict,
} from "./exception-policy.js"
export type { ExceptionReconciliation, ExceptionRecordCore } from "./reconcile-exceptions.js"
// Re-exported because `loadExceptionRegistry` below takes a `schema: StandardSchemaV1<...>`
// parameter. A consumer implementing one, or passing a Zod/Valibot/ArkType schema, needs this
// type in scope. With it, the consumer stays inside this independent `./helpers` barrel. A
// library schema's type already satisfies this hand-vendored interface structurally.
// `src/index.ts` re-exports the same vendored contract for the root barrel's `output.schema`
// option (ADR 0012). Each barrel keeps its re-export by hand, since the two barrels are
// independent (see this file's module doc comment above).
export type { StandardSchemaV1 } from "../standard-schema/types.js"
export {
  evaluateExceptionRecord,
  evaluateExceptionRecords,
  hashRequirementFields,
  resolveExceptionPolicy,
  validateExceptionPolicyConfig,
} from "./exception-policy.js"

export type {
  RepoContractLogMode,
  RepoContractLogs,
  RepoContractLogsFileSystem,
  RepoContractLogsOptions,
} from "./contract-logs.js"
export {
  onEvidenceSaveToRepoContractLogs,
  onVerdictPrependRepoContractLogs,
  REPO_CONTRACT_LOG_DIRECTORY,
  REPO_CONTRACT_LOG_EVIDENCE_MARKER,
  repoContractLogs,
} from "./contract-logs.js"

export type { FileCacheStore } from "./file-cache-store.js"
export { createFileCacheStore } from "./file-cache-store.js"

export { loadExceptionRegistry } from "./load-exception-registry.js"

export { reconcileExceptions, serializeExceptionRegistry } from "./reconcile-exceptions.js"

export { writeExceptionRegistry } from "./write-exception-registry.js"

export type {
  ExceptionMethod,
  ExceptionRegistrySchema,
  ExceptionType,
  ExceptionV2Fields,
  SecurityExceptionFields,
  VersionedExceptionRecord,
} from "./exception-record.js"
export {
  asFlatExceptionRecords,
  emptyV2Fields,
  evaluateFindingVerdict,
  EXCEPTION_METHODS,
  EXCEPTION_TYPES,
  EXCEPTION_V2_FIELD_KEYS,
  exceptionRegistryStandardSchema,
  isExpired,
  isLegacyRecord,
  isValidNonEmptyStringField,
  LEGACY_FIELD_VALUE,
  recordFieldValue,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateExceptionRegistry,
  validateSecurityExceptionFields,
} from "./exception-record.js"

export type { PersistedExceptionRegistry } from "./persist-exception-registry.js"
export {
  loadAndReconcileExceptionRegistry,
  reconcileAndPersistExceptionRegistry,
} from "./persist-exception-registry.js"

export type {
  ExceptionInventory,
  ExceptionRegistryContents,
  ExceptionRegistryError,
  ExceptionRegistrySummary,
} from "./exception-inventory.js"
export {
  EXCEPTION_REGISTRY_DIRECTORY,
  readExceptionRegistries,
  renderExceptionInventory,
  summarizeExceptionRegistries,
} from "./exception-inventory.js"
