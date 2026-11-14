/**
 * Governed exceptions: let a check waive one finding when a named record justifies it, without
 * weakening the check. A record names its `{ group, category }`, and this barrel resolves that to
 * a policy (exact, then glob, then default) and checks the record's fields against it.
 *
 * The check stays in charge of everything else. It decides what a finding is, matches records to
 * findings and owns the identity of each finding (see `checks/shared/`, unpublished). This is the
 * mechanism `scripts/suppression-governance/` built for `disable-comments.json` (ADR 0006),
 * extracted for any check; specs/decisions/0013-reusable-exception-policy-helper.md has the
 * boundary.
 *
 * Published **Stable** (see `VERSIONING.md` and
 * specs/decisions/0019-helpers-promoted-presets-stay-experimental.md). From `1.0` a new export is
 * a minor release and a changed signature or behavior is a major one. While the package is `0.x`,
 * the release tooling deflates a new export to a patch.
 *
 * Published under its own `./helpers` subpath, independent of the root and `./presets` barrels.
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
// parameter. A consumer implementing one, or passing a real Zod/Valibot/ArkType schema, needs
// this type in scope without reaching past this independent `./helpers` barrel into the root
// `repo-contract` export or `src/standard-schema/types.js` directly. A real schema's own type
// already satisfies this hand-vendored interface structurally. Same vendored contract
// `src/index.ts` re-exports for the root barrel's own `output.schema` option (ADR 0012). It is
// kept in sync by hand since the two barrels are deliberately independent (see this file's own
// module doc comment above).
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
