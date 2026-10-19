# repo-contract public API

Every export a consumer can import, by entry point, for version 0.11.1. Generated from the package's committed API baselines; the type declarations in the installed package are the authority.

## `repo-contract`

- `CheckDefinition` (interface): `interface CheckDefinition extends CheckDefinitionConfig`
- `CheckDefinitionConfig` (interface): `interface CheckDefinitionConfig`
- `CheckEvidence` (interface): `interface CheckEvidence`
- `CheckSchema` (typealias): `type CheckSchema = Record<string, CheckDefinition>`
- `CheckStatus` (typealias): `type CheckStatus = "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted"`
- `defineRepoContract` (function): `function defineRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks> & { readonly checks: ValidatedCheckSchema<TChecks>; }): RepoContractConfig<TChecks>`
- `DependencyDeclaredLaterError` (class): `class DependencyDeclaredLaterError extends RepoContractError`
- `Evidence` (interface): `interface Evidence<TChecks extends CheckSchema = CheckSchema>`
- `InvalidCheckConfigError` (class): `class InvalidCheckConfigError extends RepoContractError`
- `InvalidRepoContractConfigError` (class): `class InvalidRepoContractConfigError extends RepoContractError`
- `OutputFormat` (typealias): `type OutputFormat = "json" | "text"`
- `ParsedOutput` (typealias): `type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure`
- `ParsedOutputFailure` (interface): `interface ParsedOutputFailure`
- `ParsedOutputSuccess` (interface): `interface ParsedOutputSuccess<T>`
- `Policy` (typealias): `type Policy<TChecks extends CheckSchema = CheckSchema> = (ctx: PolicyContext<TChecks>) => PolicyResult | Promise<PolicyResult>`
- `PolicyContext` (interface): `interface PolicyContext<TChecks extends CheckSchema = CheckSchema>`
- `PolicyOutcome` (typealias): `type PolicyOutcome = "pass" | "fail" | "warn"`
- `PolicyReadFailedParseValueError` (class): `class PolicyReadFailedParseValueError extends RepoContractError`
- `PolicyReadUnrequestedOutputError` (class): `class PolicyReadUnrequestedOutputError extends RepoContractError`
- `PolicyResult` (interface): `interface PolicyResult`
- `PolicyThrewError` (class): `class PolicyThrewError extends RepoContractError`
- `renderMarkdownSummary` (function): `function renderMarkdownSummary<TChecks extends CheckSchema>(verdict: Verdict<TChecks>, evidence?: Evidence<TChecks>, options?: RenderMarkdownSummaryOptions): string`
- `RenderMarkdownSummaryOptions` (interface): `interface RenderMarkdownSummaryOptions`
- `RepoContractConfig` (interface): `interface RepoContractConfig<TChecks extends CheckSchema = CheckSchema>`
- `RepoContractError` (class): `abstract class RepoContractError extends Error`
- `runRepoContract` (function): `function runRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks>, options?: RunRepoContractOptions): Promise<{ evidence: Evidence<TChecks>; verdict: Verdict<TChecks>; }>`
- `RunRepoContractOptions` (interface): `interface RunRepoContractOptions`
- `serializeRun` (function): `function serializeRun<TChecks extends CheckSchema>(run: { readonly evidence: Evidence<TChecks>; readonly verdict: Verdict<TChecks>; }): { readonly evidence: string; readonly verdict: string; }`
- `Spawner` (typealias): `type Spawner = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess`
- `StandardSchemaV1` (interface): `interface StandardSchemaV1<Input = unknown, Output = Input>`
- `StandardSchemaV1` (namespace): `namespace StandardSchemaV1`
- `StandardSchemaValidateThrewError` (class): `class StandardSchemaValidateThrewError extends RepoContractError`
- `SyncSpawner` (typealias): `type SyncSpawner = (command: string, args: readonly string[], options: SpawnSyncOptions) => SpawnSyncReturns<Buffer | string>`
- `UnknownCheckIdError` (class): `class UnknownCheckIdError extends RepoContractError`
- `ValidatedCheckSchema` (typealias): `type ValidatedCheckSchema<T> = { readonly [K in keyof T]: T[K] extends CheckDefinitionConfig ? Omit<T[K], "dependsOn"> & { readonly dependsOn?: readonly (Exclude<keyof T, K> & string)[]; } : never; }`
- `Verdict` (interface): `interface Verdict<TChecks extends CheckSchema = CheckSchema>`

## `repo-contract/helpers`

- `evaluateExceptionRecord` (function): `function evaluateExceptionRecord<TRecord>(input: ExceptionRecordEvaluation<TRecord>): ExceptionDeterminant<TRecord>`
- `evaluateExceptionRecords` (function): `function evaluateExceptionRecords<TRecord>(inputs: readonly ExceptionRecordEvaluation<TRecord>[]): readonly ExceptionDeterminant<TRecord>[]`
- `ExceptionCategoryGroup` (interface): `interface ExceptionCategoryGroup`
- `ExceptionClassification` (interface): `interface ExceptionClassification`
- `ExceptionDeterminant` (interface): `interface ExceptionDeterminant<TRecord>`
- `ExceptionPolicy` (typealias): `type ExceptionPolicy = { readonly mode: "forbidden"; } | { readonly mode: "allowed"; } | { readonly mode: "exception"; readonly requirements: readonly string[]; }`
- `ExceptionPolicyConfig` (typealias): `type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>`
- `ExceptionReconciliation` (interface): `interface ExceptionReconciliation<TFinding, TRecord>`
- `ExceptionRecordCore` (interface): `interface ExceptionRecordCore`
- `ExceptionRecordEvaluation` (interface): `interface ExceptionRecordEvaluation<TRecord>`
- `ExceptionVerdict` (typealias): `type ExceptionVerdict = "forbidden" | "insufficient" | "permitted"`
- `hashRequirementFields` (function): `function hashRequirementFields<TRecord>(record: TRecord, fields: readonly string[], fieldValue: (record: TRecord, requirement: string) => string): string`
- `loadExceptionRegistry` (function): `function loadExceptionRegistry<T>(input: { readonly path: string; readonly schema: StandardSchemaV1<unknown, readonly T[]>; readonly readFile?: (path: string) => Promise<string>; }): Promise<{ ok: true; records: readonly T[]; } | { ok: false; errors: readonly string[]; }>`
- `onEvidenceSaveToRepoContractLogs` (function, beta): `function onEvidenceSaveToRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, evidence: CheckEvidence) => void`
- `onVerdictPrependRepoContractLogs` (function, beta): `function onVerdictPrependRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, result: PolicyResult) => void`
- `reconcileExceptions` (function): `function reconcileExceptions<TFinding, TRecord extends { readonly id: string; }>(input: { readonly existing: readonly TRecord[]; readonly findings: readonly TFinding[]; readonly deriveId: (finding: TFinding) => string; readonly createStub: (finding: TFinding, id: string) => TRecord; }): { readonly ok: true; readonly reconciliation: ExceptionReconciliation<TFinding, TRecord>; } | { readonly ok: false; readonly error: string; }`
- `REPO_CONTRACT_LOG_DIRECTORY` (variable, beta): `REPO_CONTRACT_LOG_DIRECTORY: string`
- `REPO_CONTRACT_LOG_EVIDENCE_MARKER` (variable, beta): `REPO_CONTRACT_LOG_EVIDENCE_MARKER = "=== evidence ==="`
- `RepoContractLogMode` (typealias, beta): `type RepoContractLogMode = "all" | "failing" | "off"`
- `repoContractLogs` (function, beta): `function repoContractLogs(options?: RepoContractLogsOptions): RepoContractLogs`
- `RepoContractLogs` (interface, beta): `interface RepoContractLogs`
- `RepoContractLogsFileSystem` (interface, beta): `interface RepoContractLogsFileSystem`
- `RepoContractLogsOptions` (interface, beta): `interface RepoContractLogsOptions`
- `resolveExceptionPolicy` (function): `function resolveExceptionPolicy(classification: ExceptionClassification, config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): ExceptionPolicy`
- `serializeExceptionRegistry` (function): `function serializeExceptionRegistry(records: readonly (Record<string, unknown> & { readonly id: string; })[]): string`
- `StandardSchemaV1` (interface): `interface StandardSchemaV1<Input = unknown, Output = Input>`
- `StandardSchemaV1` (namespace): `namespace StandardSchemaV1`
- `validateExceptionPolicyConfig` (function): `function validateExceptionPolicyConfig(config: ExceptionPolicyConfig, validRequirements?: readonly string[]): readonly string[]`
- `writeExceptionRegistry` (function): `function writeExceptionRegistry(input: { readonly path: string; readonly records: readonly (Record<string, unknown> & { readonly id: string; })[]; readonly readFile?: (path: string) => Promise<string>; readonly writeFile?: (path: string, data: string) => Promise<void>; readonly rename?: (from: string, to: string) => Promise<void>; readonly isSymlink?: (path: string) => Promise<boolean>; }): Promise<{ readonly ok: true; readonly written: boolean; } | { readonly ok: false; readonly error: string; }>`

## `repo-contract/presets`

- `arethetypeswrong` (variable, beta): `arethetypeswrong: CheckDefinitionConfig`
- `brokenLinks` (function, beta): `function brokenLinks(options?: BrokenLinksOptions): CheckDefinitionConfig`
- `commitlint` (function, beta): `function commitlint(options?: CommitlintOptions): CheckDefinitionConfig`
- `deadCode` (function, beta): `function deadCode(options?: DeadCodeOptions): CheckDefinitionConfig`
- `distNoUrls` (function, beta): `function distNoUrls(options?: DistNoUrlsOptions): CheckDefinitionConfig`
- `DistNoUrlsAllowEntry` (interface): `interface DistNoUrlsAllowEntry`
- `DistNoUrlsOptions` (interface): `interface DistNoUrlsOptions`
- `duplication` (function, beta): `function duplication(options?: DuplicationOptions): CheckDefinitionConfig`
- `e2e` (variable, beta): `e2e: CheckDefinitionConfig`
- `format` (variable, beta): `format: CheckDefinitionConfig`
- `license` (variable, beta): `license: CheckDefinitionConfig`
- `lint` (function, beta): `function lint(options?: LintOptions): CheckDefinitionConfig`
- `markdownlint` (function, beta): `function markdownlint(options?: MarkdownlintOptions): CheckDefinitionConfig`
- `publint` (variable, beta): `publint: CheckDefinitionConfig`
- `securityDeps` (variable, beta): `securityDeps: CheckDefinitionConfig`
- `securitySecrets` (variable, beta): `securitySecrets: CheckDefinitionConfig`
- `stylelint` (function, beta): `function stylelint(options?: StylelintOptions): CheckDefinitionConfig`
- `test` (variable, beta): `test: CheckDefinitionConfig`
- `typecheck` (variable, beta): `typecheck: CheckDefinitionConfig`
