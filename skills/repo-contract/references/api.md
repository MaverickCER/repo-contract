# repo-contract public API

Every export a consumer can import, by entry point, for version 0.16.0. Generated from the package's committed API baselines; the type declarations in the installed package are the authority.

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

## `repo-contract/affected`

- `AffectedOptions` (interface): `interface AffectedOptions`
- `AffectedResult` (interface): `interface AffectedResult`
- `AffectedScope` (typealias): `type AffectedScope = "affected" | "full"`
- `ArtifactInput` (interface): `interface ArtifactInput`
- `Cache_2` (interface): `interface Cache`
- `CACHE_FORMAT` (variable): `CACHE_FORMAT = 1`
- `CacheEntry` (interface): `interface CacheEntry<TValue = unknown>`
- `cacheKey` (function): `function cacheKey(input: { readonly check: string; readonly inputs: Readonly<Record<string, string>>; readonly tools: Readonly<Record<string, string>>; }): string`
- `CacheLookup` (typealias): `type CacheLookup<TValue = unknown> = { readonly hit: true; readonly entry: CacheEntry<TValue>; } | { readonly hit: false; readonly reason: "miss" | "corrupt" | "disabled"; }`
- `CacheMode` (typealias): `type CacheMode = "read-write" | "read-only" | "off"`
- `CacheStats` (interface): `interface CacheStats`
- `CacheStore` (interface): `interface CacheStore`
- `CacheStoreInput` (interface): `interface CacheStoreInput`
- `CanaryInput` (interface): `interface CanaryInput`
- `CanaryResult` (interface): `interface CanaryResult`
- `ChangedFile` (interface): `interface ChangedFile`
- `ChangeKind` (typealias): `type ChangeKind = "added" | "modified" | "deleted" | "renamed"`
- `computeAffected` (function): `function computeAffected(input: ComputeAffectedInput): AffectedResult`
- `computeAffectedFromGit` (function): `function computeAffectedFromGit(input: ComputeAffectedFromGitInput): Promise<AffectedResult>`
- `ComputeAffectedFromGitInput` (interface): `interface ComputeAffectedFromGitInput`
- `ComputeAffectedInput` (interface): `interface ComputeAffectedInput`
- `ContractConfig` (interface): `interface ContractConfig`
- `ContractConfigSource` (typealias): `type ContractConfigSource = "contract" | "repo-contract" | "none"`
- `createCache` (function): `function createCache(options: { readonly store: CacheStore; readonly mode: CacheMode; readonly now?: () => Date; }): Cache`
- `DEFAULT_IGNORE` (variable): `DEFAULT_IGNORE: readonly string[]`
- `DEFAULT_NOT_MUTATED` (variable): `DEFAULT_NOT_MUTATED: readonly string[]`
- `DEFAULT_TESTS` (variable): `DEFAULT_TESTS: readonly string[]`
- `DEFAULT_TRIGGERS` (variable): `DEFAULT_TRIGGERS: readonly string[]`
- `diagnose` (function): `function diagnose(snapshot: DoctorSnapshot): DoctorReport`
- `DoctorFinding` (interface): `interface DoctorFinding`
- `DoctorFix` (interface): `interface DoctorFix`
- `DoctorReport` (interface): `interface DoctorReport`
- `DoctorSnapshot` (interface): `interface DoctorSnapshot`
- `explainAffected` (function): `function explainAffected(result: AffectedResult): string[]`
- `findEscapes` (function): `function findEscapes(input: CanaryInput): CanaryResult`
- `FindingSeverity` (typealias): `type FindingSeverity = "warn" | "info"`
- `findMutantById` (function): `function findMutantById(mutants: readonly ResolvedMutant[], id: string): ResolvedMutant | undefined`
- `GitCapabilities` (interface): `interface GitCapabilities`
- `LinkRule` (interface): `interface LinkRule`
- `loadCompilerOptions` (function): `function loadCompilerOptions(input: LoadCompilerOptionsInput): Promise<{ readonly options?: TypeScript.CompilerOptions; } | { readonly because: Widening; }>`
- `LoadCompilerOptionsInput` (interface): `interface LoadCompilerOptionsInput`
- `MAX_MUTATION_SHARDS` (variable): `MAX_MUTATION_SHARDS = 256`
- `mergeMutationReports` (function): `function mergeMutationReports(reports: readonly ShardReport[], total: number): MergeResult`
- `MergeResult` (typealias): `type MergeResult = { readonly ok: true; readonly report: unknown; } | { readonly ok: false; readonly error: string; }`
- `MissExplanation` (typealias): `type MissExplanation = { readonly kind: "no-previous"; } | { readonly kind: "same-inputs"; } | { readonly kind: "changed"; readonly changed: readonly string[]; readonly added: readonly string[]; readonly removed: readonly string[]; readonly comparedWith: string; }`
- `MutantIdentity` (typealias): `type MutantIdentity = Pick<ResolvedMutant, "file" | "mutator" | "original" | "replacement">`
- `MutatedFile` (interface): `interface MutatedFile`
- `MUTATION_SHARD_BYTES` (variable): `MUTATION_SHARD_BYTES = 65536`
- `mutationExceptionId` (function): `function mutationExceptionId(mutant: MutantIdentity): string`
- `MutationPlan` (interface): `interface MutationPlan`
- `mutationShardCount` (function): `function mutationShardCount(input: { readonly bytes: number; readonly files: number; }): number`
- `packArtifacts` (function): `function packArtifacts(files: readonly ArtifactInput[]): PackedArtifacts`
- `PackedArtifact` (interface): `interface PackedArtifact`
- `PackedArtifacts` (interface): `interface PackedArtifacts`
- `parseAffectedConfig` (function): `function parseAffectedConfig(value: unknown): { readonly options: AffectedOptions; } | { readonly error: string; }`
- `ParsedScopeArgs` (typealias): `type ParsedScopeArgs = { readonly ok: true; readonly scope?: RequestedScope; readonly base?: string; readonly rest: readonly string[]; } | { readonly ok: false; readonly error: string; }`
- `parseFailFastArgs` (function): `function parseFailFastArgs(argv: readonly string[]): { readonly failFast?: boolean; readonly rest: readonly string[]; }`
- `parseNameStatus` (function): `function parseNameStatus(output: string): ChangedFile[] | undefined`
- `parseScopeArgs` (function): `function parseScopeArgs(argv: readonly string[]): ParsedScopeArgs`
- `parseShardSpec` (function): `function parseShardSpec(text: string): ShardSpec`
- `planFixes` (function): `function planFixes(findings: readonly DoctorFinding[], files: Readonly<Record<string, string | undefined>>): PlannedChange[]`
- `planMutationShards` (function): `function planMutationShards(files: readonly MutatedFile[]): MutationPlan`
- `PlannedChange` (interface): `interface PlannedChange`
- `planShards` (function): `function planShards(input: ShardPlanInput): ShardPlan`
- `PruneLimits` (interface): `interface PruneLimits`
- `readContractConfig` (function): `function readContractConfig(manifest: unknown): { readonly config: ContractConfig; } | { readonly error: string; }`
- `RequestedScope` (typealias): `type RequestedScope = RunScope | "auto"`
- `resolveCacheMode` (function): `function resolveCacheMode(input: { readonly scope: RunScope; readonly env: Readonly<Record<string, string | undefined>>; readonly flag?: CacheMode; }): { readonly mode: CacheMode; readonly reason: string; }`
- `ResolvedMutant` (interface): `interface ResolvedMutant`
- `resolveFailFast` (function): `function resolveFailFast(input: { readonly flag?: boolean; readonly env: Readonly<Record<string, string | undefined>>; }): boolean`
- `resolveMutants` (function): `function resolveMutants(report: unknown): { readonly ok: true; readonly mutants: readonly ResolvedMutant[]; } | { readonly ok: false; readonly error: string; }`
- `resolveScope` (function): `function resolveScope(input: ResolveScopeInput): ScopeDecision`
- `ResolveScopeInput` (interface): `interface ResolveScopeInput`
- `RunScope` (typealias): `type RunScope = "affected" | "full"`
- `ScopeDecision` (interface): `interface ScopeDecision`
- `ScopeSource` (typealias): `type ScopeSource = "flag" | "env" | "ci-full" | "release" | "ci-event" | "default"`
- `shardMatrix` (function): `function shardMatrix(count: number): ShardMatrix`
- `ShardMatrix` (interface): `interface ShardMatrix`
- `ShardPlan` (interface): `interface ShardPlan`
- `ShardPlanInput` (interface): `interface ShardPlanInput`
- `ShardReport` (interface): `interface ShardReport`
- `ShardSpec` (typealias): `type ShardSpec = { readonly ok: true; readonly index: number; readonly total: number; } | { readonly ok: false; readonly error: string; }`
- `TypeScriptApi` (typealias): `type TypeScriptApi = typeof TypeScript`
- `unpackArtifacts` (function): `function unpackArtifacts(value: unknown): UnpackResult`
- `UnpackResult` (typealias): `type UnpackResult = { readonly ok: true; readonly files: readonly { readonly path: string; readonly content: Uint8Array; }[]; } | { readonly ok: false; readonly error: string; }`
- `Widening` (interface): `interface Widening`
- `WideningReason` (typealias): `type WideningReason = "global-trigger" | "unplaced-file" | "parse-error" | "dynamic-import" | "module-side-effect" | "git-failed" | "tsconfig"`

## `repo-contract/config`

- `DEFAULT_EXCLUDE` (variable): `DEFAULT_EXCLUDE: readonly string[]`
- `entries` (function): `function entries(manifest: PackageManifest, options?: EntriesOptions): readonly EntryPoint[]`
- `EntriesOptions` (interface): `interface EntriesOptions`
- `EntryPoint` (interface): `interface EntryPoint`
- `excludeGlobs` (function): `function excludeGlobs(exclude?: readonly string[]): readonly string[]`
- `negateGlobs` (function): `function negateGlobs(globs: readonly string[]): readonly string[]`
- `PackageManifest` (interface): `interface PackageManifest`
- `ToolConfigOptions` (interface): `interface ToolConfigOptions`

## `repo-contract/config/knip`

- `knipConfig` (function, beta): `function knipConfig(options: KnipConfigOptions): KnipConfigFragment`
- `KnipConfigFragment` (interface): `interface KnipConfigFragment`
- `KnipConfigOptions` (interface): `interface KnipConfigOptions extends ToolConfigOptions`

## `repo-contract/config/stryker`

- `strykerConfig` (function, beta): `function strykerConfig(options?: StrykerConfigOptions): StrykerConfigFragment`
- `StrykerConfigFragment` (interface): `interface StrykerConfigFragment`
- `StrykerConfigOptions` (interface): `interface StrykerConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude">`

## `repo-contract/config/tsup`

- `tsupConfig` (function, beta): `function tsupConfig(options: TsupConfigOptions): TsupConfigFragment`
- `TsupConfigFragment` (interface): `interface TsupConfigFragment`
- `TsupConfigOptions` (interface): `interface TsupConfigOptions extends ToolConfigOptions`

## `repo-contract/config/typedoc`

- `typedocConfig` (function, beta): `function typedocConfig(options: ToolConfigOptions): TypedocConfigFragment`
- `TypedocConfigFragment` (interface): `interface TypedocConfigFragment`

## `repo-contract/config/vitest`

- `CoverageReporterName` (typealias): `type CoverageReporterName = "text" | "html" | "lcov" | "json" | "json-summary"`
- `vitestConfig` (function, beta): `function vitestConfig(options?: VitestConfigOptions): VitestConfigFragment`
- `VitestConfigFragment` (interface): `interface VitestConfigFragment`
- `VitestConfigOptions` (interface): `interface VitestConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude">`

## `repo-contract/helpers`

- `asFlatExceptionRecords` (function): `function asFlatExceptionRecords(records: readonly { readonly id: string; }[]): readonly (Record<string, unknown> & { readonly id: string; })[]`
- `createFileCacheStore` (function): `function createFileCacheStore(directory: string): FileCacheStore`
- `emptyV2Fields` (function): `function emptyV2Fields(): ExceptionV2Fields`
- `evaluateExceptionRecord` (function): `function evaluateExceptionRecord<TRecord>(input: ExceptionRecordEvaluation<TRecord>): ExceptionDeterminant<TRecord>`
- `evaluateExceptionRecords` (function): `function evaluateExceptionRecords<TRecord>(inputs: readonly ExceptionRecordEvaluation<TRecord>[]): readonly ExceptionDeterminant<TRecord>[]`
- `evaluateFindingVerdict` (function): `function evaluateFindingVerdict(record: unknown, classifications: readonly [ExceptionClassification, ...ExceptionClassification[]], config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): { readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"; readonly missing: readonly string[]; }`
- `EXCEPTION_METHODS` (variable): `EXCEPTION_METHODS: readonly ["mechanical-reverification", "independent-human-review", "policy-rule"]`
- `EXCEPTION_REGISTRY_DIRECTORY` (variable): `EXCEPTION_REGISTRY_DIRECTORY = ".repo-contract/exceptions"`
- `EXCEPTION_TYPES` (variable): `EXCEPTION_TYPES: readonly ["validated-false-positive", "accepted-risk", "compensating-control", "tooling-limitation", "scheduled-remediation", "platform-or-vendor-constraint", "required-for-package-to-exist", "dev-only-not-shipped"]`
- `EXCEPTION_V2_FIELD_KEYS` (variable): `EXCEPTION_V2_FIELD_KEYS: readonly ["ruleBroken", "attempted", "constraint", "whyPreferable", "residualRisk", "revisitWhen"]`
- `ExceptionCategoryGroup` (interface): `interface ExceptionCategoryGroup`
- `ExceptionClassification` (interface): `interface ExceptionClassification`
- `ExceptionDeterminant` (interface): `interface ExceptionDeterminant<TRecord>`
- `ExceptionInventory` (interface): `interface ExceptionInventory`
- `ExceptionMethod` (typealias): `type ExceptionMethod = (typeof EXCEPTION_METHODS)[number]`
- `ExceptionPolicy` (typealias): `type ExceptionPolicy = { readonly mode: "forbidden"; } | { readonly mode: "allowed"; } | { readonly mode: "exception"; readonly requirements: readonly string[]; }`
- `ExceptionPolicyConfig` (typealias): `type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>`
- `ExceptionReconciliation` (interface): `interface ExceptionReconciliation<TFinding, TRecord>`
- `ExceptionRecordCore` (interface): `interface ExceptionRecordCore`
- `ExceptionRecordEvaluation` (interface): `interface ExceptionRecordEvaluation<TRecord>`
- `ExceptionRegistryContents` (interface): `interface ExceptionRegistryContents`
- `ExceptionRegistryError` (interface): `interface ExceptionRegistryError`
- `ExceptionRegistrySchema` (interface): `interface ExceptionRegistrySchema<TRecord extends { readonly id: string; }>`
- `exceptionRegistryStandardSchema` (function): `function exceptionRegistryStandardSchema<TRecord extends { readonly id: string; }>(schema: ExceptionRegistrySchema<TRecord>): StandardSchemaV1<unknown, readonly TRecord[]>`
- `ExceptionRegistrySummary` (interface): `interface ExceptionRegistrySummary`
- `ExceptionType` (typealias): `type ExceptionType = (typeof EXCEPTION_TYPES)[number]`
- `ExceptionV2Fields` (interface): `interface ExceptionV2Fields`
- `ExceptionVerdict` (typealias): `type ExceptionVerdict = "forbidden" | "insufficient" | "permitted"`
- `FileCacheStore` (interface): `interface FileCacheStore`
- `hashRequirementFields` (function): `function hashRequirementFields<TRecord>(record: TRecord, fields: readonly string[], fieldValue: (record: TRecord, requirement: string) => string): string`
- `isExpired` (function): `function isExpired(expires: unknown, now?: Date): boolean`
- `isLegacyRecord` (function): `function isLegacyRecord(record: { readonly version: 1 | 2; }): boolean`
- `isValidNonEmptyStringField` (function): `function isValidNonEmptyStringField(value: unknown, at: string, errors: string[]): value is string`
- `LEGACY_FIELD_VALUE` (variable): `LEGACY_FIELD_VALUE = "(legacy version 1 record)"`
- `loadAndReconcileExceptionRegistry` (function): `function loadAndReconcileExceptionRegistry<TFinding extends { readonly id: string; }, TRecord extends { readonly id: string; }>(registryPath: string, registryRelativePath: string, schema: StandardSchemaV1<unknown, readonly TRecord[]>, findings: readonly TFinding[], createStub: (finding: TFinding, id: string) => TRecord): Promise<PersistExceptionRegistryResult<TRecord>>`
- `loadExceptionRegistry` (function): `function loadExceptionRegistry<T>(input: { readonly path: string; readonly schema: StandardSchemaV1<unknown, readonly T[]>; readonly readFile?: (path: string) => Promise<string>; readonly isSymlink?: (path: string) => Promise<boolean>; }): Promise<{ ok: true; records: readonly T[]; } | { ok: false; errors: readonly string[]; }>`
- `onEvidenceSaveToRepoContractLogs` (function, beta): `function onEvidenceSaveToRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, evidence: CheckEvidence) => void`
- `onVerdictPrependRepoContractLogs` (function, beta): `function onVerdictPrependRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, result: PolicyResult) => void`
- `PersistedExceptionRegistry` (interface): `interface PersistedExceptionRegistry<TRecord>`
- `PersistExceptionRegistryResult` (typealias): `type PersistExceptionRegistryResult<TRecord> = { readonly ok: true; readonly registry: PersistedExceptionRegistry<TRecord>; } | { readonly ok: false; readonly rationale: string; }`
- `readExceptionRegistries` (function): `function readExceptionRegistries(directory: string): Promise<{ readonly registries: readonly ExceptionRegistryContents[]; readonly errors: readonly ExceptionRegistryError[]; }>`
- `reconcileAndPersistExceptionRegistry` (function): `function reconcileAndPersistExceptionRegistry<TFinding extends { readonly id: string; }, TRecord extends { readonly id: string; }>(registryPath: string, registryRelativePath: string, existing: readonly TRecord[], findings: readonly TFinding[], createStub: (finding: TFinding, id: string) => TRecord): Promise<PersistExceptionRegistryResult<TRecord>>`
- `reconcileExceptions` (function): `function reconcileExceptions<TFinding, TRecord extends { readonly id: string; }>(input: { readonly existing: readonly TRecord[]; readonly findings: readonly TFinding[]; readonly deriveId: (finding: TFinding) => string; readonly createStub: (finding: TFinding, id: string) => TRecord; }): { readonly ok: true; readonly reconciliation: ExceptionReconciliation<TFinding, TRecord>; } | { readonly ok: false; readonly error: string; }`
- `recordFieldValue` (function): `function recordFieldValue(record: unknown, requirement: string): string`
- `renderExceptionInventory` (function): `function renderExceptionInventory(inventory: ExceptionInventory): string`
- `REPO_CONTRACT_LOG_DIRECTORY` (variable, beta): `REPO_CONTRACT_LOG_DIRECTORY: string`
- `REPO_CONTRACT_LOG_EVIDENCE_MARKER` (variable, beta): `REPO_CONTRACT_LOG_EVIDENCE_MARKER = "=== evidence ==="`
- `RepoContractLogMode` (typealias, beta): `type RepoContractLogMode = "all" | "failing" | "off"`
- `repoContractLogs` (function, beta): `function repoContractLogs(options?: RepoContractLogsOptions): RepoContractLogs`
- `RepoContractLogs` (interface, beta): `interface RepoContractLogs`
- `RepoContractLogsFileSystem` (interface, beta): `interface RepoContractLogsFileSystem`
- `RepoContractLogsOptions` (interface, beta): `interface RepoContractLogsOptions`
- `resolveExceptionPolicy` (function): `function resolveExceptionPolicy(classification: ExceptionClassification, config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): ExceptionPolicy`
- `SECURITY_EXCEPTION_FIELD_KEYS` (variable): `SECURITY_EXCEPTION_FIELD_KEYS: readonly ["alternatives", "remediation", "method", "exceptionType"]`
- `SecurityExceptionFields` (interface): `interface SecurityExceptionFields`
- `serializeExceptionRegistry` (function): `function serializeExceptionRegistry(records: readonly (Record<string, unknown> & { readonly id: string; })[]): string`
- `StandardSchemaV1` (interface): `interface StandardSchemaV1<Input = unknown, Output = Input>`
- `StandardSchemaV1` (namespace): `namespace StandardSchemaV1`
- `summarizeExceptionRegistries` (function): `function summarizeExceptionRegistries(registries: readonly ExceptionRegistryContents[], now: Date, errors?: readonly ExceptionRegistryError[]): ExceptionInventory`
- `validateExceptionPolicyConfig` (function): `function validateExceptionPolicyConfig(config: ExceptionPolicyConfig, validRequirements?: readonly string[]): readonly string[]`
- `validateExceptionRegistry` (function): `function validateExceptionRegistry<TRecord extends { readonly id: string; }>(value: unknown, schema: ExceptionRegistrySchema<TRecord>): { readonly ok: true; readonly records: readonly TRecord[]; } | { readonly ok: false; readonly errors: readonly string[]; }`
- `validateSecurityExceptionFields` (function): `function validateSecurityExceptionFields(raw: Readonly<Record<string, unknown>>, index: number, allowedExceptionTypes: readonly ExceptionType[], errors: string[]): SecurityExceptionFields | undefined`
- `VersionedExceptionRecord` (interface): `interface VersionedExceptionRecord`
- `writeExceptionRegistry` (function): `function writeExceptionRegistry(input: { readonly path: string; readonly records: readonly (Record<string, unknown> & { readonly id: string; })[]; readonly readFile?: (path: string) => Promise<string>; readonly writeFile?: (path: string, data: string) => Promise<void>; readonly rename?: (from: string, to: string) => Promise<void>; readonly isSymlink?: (path: string) => Promise<boolean>; }): Promise<{ readonly ok: true; readonly written: boolean; } | { readonly ok: false; readonly error: string; }>`

## `repo-contract/metrics`

- `buildEvidenceManifest` (function): `function buildEvidenceManifest(input: ManifestInput): EvidenceManifest`
- `CacheOutcome` (typealias): `type CacheOutcome = "hit" | "miss" | "off"`
- `CheckRecord` (interface): `interface CheckRecord`
- `createRunRecord` (function): `function createRunRecord(input: RunRecordInput): RunRecord`
- `EvidenceManifest` (interface): `interface EvidenceManifest extends ManifestFacts`
- `ManifestInput` (interface): `interface ManifestInput extends ManifestFacts`
- `ManifestVerification` (interface): `interface ManifestVerification`
- `MaturityInput` (interface): `interface MaturityInput`
- `maturityLevel` (function): `function maturityLevel(input: MaturityInput): MaturityResult`
- `MaturityResult` (interface): `interface MaturityResult`
- `parseRunLog` (function): `function parseRunLog(text: string): { readonly records: readonly RunRecord[]; readonly errors: readonly RunLogError[]; }`
- `Pillar` (typealias): `type Pillar = (typeof PILLARS)[number]`
- `pillarCoverage` (function): `function pillarCoverage(checks: readonly { readonly id: string; readonly pillar?: Pillar; }[]): PillarCoverage`
- `PillarCoverage` (interface): `interface PillarCoverage`
- `PILLARS` (variable): `PILLARS: readonly ["correctness", "security", "performance", "accessibility", "compliance", "maintainability"]`
- `RunLogError` (interface): `interface RunLogError`
- `RunRecord` (interface): `interface RunRecord extends RunRecordInput`
- `RunRecordInput` (interface): `interface RunRecordInput`
- `RunSummary` (interface): `interface RunSummary`
- `serializeRunRecord` (function): `function serializeRunRecord(record: RunRecord): string`
- `summarizeRuns` (function): `function summarizeRuns(records: readonly RunRecord[], filter?: SummaryFilter): RunSummary`
- `SummaryFilter` (interface): `interface SummaryFilter`
- `Verdict` (typealias): `type Verdict = "pass" | "warn" | "fail"`
- `verifyEvidenceManifest` (function): `function verifyEvidenceManifest(value: unknown, evidence?: Readonly<Record<string, unknown>>): ManifestVerification`

## `repo-contract/presets`

- `aiReview` (function, beta): `function aiReview(options: AiReviewOptions): CheckDefinitionConfig`
- `AiReviewFinding` (interface, beta): `interface AiReviewFinding`
- `AiReviewOptions` (interface, beta): `interface AiReviewOptions`
- `AiReviewReply` (interface, beta): `interface AiReviewReply`
- `arethetypeswrong` (function, beta): `function arethetypeswrong(options?: ArethetypeswrongOptions): CheckDefinitionConfig`
- `ArethetypeswrongOptions` (interface): `interface ArethetypeswrongOptions`
- `AttwResolutionKind` (typealias): `type AttwResolutionKind = "node10" | "node16-cjs" | "node16-esm" | "bundler"`
- `brokenLinks` (function, beta): `function brokenLinks(options?: BrokenLinksOptions): CheckDefinitionConfig`
- `BrokenLinksOptions` (interface): `interface BrokenLinksOptions`
- `BrokenLinksStart` (interface): `interface BrokenLinksStart`
- `bundledDependencies` (variable, beta): `bundledDependencies: CheckDefinitionConfig`
- `commitlint` (function, beta): `function commitlint(options?: CommitlintOptions): CheckDefinitionConfig`
- `coverage` (function, beta): `function coverage(options?: CoverageOptions): CheckDefinitionConfig`
- `CoverageOptions` (interface): `interface CoverageOptions`
- `CoverageThresholds` (interface): `interface CoverageThresholds`
- `crap` (function, beta): `function crap(options?: CrapOptions): CheckDefinitionConfig`
- `CrapOptions` (interface): `interface CrapOptions`
- `deadCode` (function, beta): `function deadCode(options?: DeadCodeOptions): CheckDefinitionConfig`
- `distNoUrls` (function, beta): `function distNoUrls(options?: DistNoUrlsOptions): CheckDefinitionConfig`
- `DistNoUrlsAllowEntry` (interface): `interface DistNoUrlsAllowEntry`
- `DistNoUrlsOptions` (interface): `interface DistNoUrlsOptions`
- `duplication` (function, beta): `function duplication(options?: DuplicationOptions): CheckDefinitionConfig`
- `DuplicationOptions` (interface): `interface DuplicationOptions`
- `e2e` (variable, beta): `e2e: CheckDefinitionConfig`
- `format` (variable, beta): `format: CheckDefinitionConfig`
- `license` (variable, beta): `license: CheckDefinitionConfig`
- `lint` (function, beta): `function lint(options?: LintOptions): CheckDefinitionConfig`
- `markdownlint` (function, beta): `function markdownlint(options?: MarkdownlintOptions): CheckDefinitionConfig`
- `MarkdownlintOptions` (interface): `interface MarkdownlintOptions`
- `mutation` (function, beta): `function mutation(options?: MutationOptions): CheckDefinitionConfig`
- `MutationOptions` (interface): `interface MutationOptions`
- `npmScript` (function, beta): `function npmScript(options: NpmScriptOptions): CheckDefinitionConfig`
- `NpmScriptOptions` (interface): `interface NpmScriptOptions`
- `publint` (variable, beta): `publint: CheckDefinitionConfig`
- `quickStart` (function, beta): `function quickStart(options?: QuickStartOptions): CheckDefinitionConfig`
- `QuickStartOptions` (interface): `interface QuickStartOptions`
- `sbom` (function, beta): `function sbom(options?: SbomOptions): CheckDefinitionConfig`
- `SbomOptions` (interface, beta): `interface SbomOptions`
- `securityDeps` (function, beta): `function securityDeps(options?: SecurityDepsOptions): CheckDefinitionConfig`
- `SecurityDepsOptions` (interface): `interface SecurityDepsOptions`
- `securitySecrets` (variable, beta): `securitySecrets: CheckDefinitionConfig`
- `stylelint` (function, beta): `function stylelint(options?: StylelintOptions): CheckDefinitionConfig`
- `test` (variable, beta): `test: CheckDefinitionConfig`
- `typecheck` (variable, beta): `typecheck: CheckDefinitionConfig`

## `repo-contract/tiers`

- `app` (function, beta): `function app(overrides?: TierOverrides<AppCheckId>): TierConfig<AppCheckId>`
- `AppCheckId` (typealias): `type AppCheckId = BasicCheckId | "Build" | "DeadCode" | "Duplication" | "Licenses" | "DocsLinks" | "Coverage"`
- `basic` (function, beta): `function basic(overrides?: TierOverrides<BasicCheckId>): TierConfig<BasicCheckId>`
- `BasicCheckId` (typealias): `type BasicCheckId = "Format" | "Lint" | "Typecheck" | "Tests" | "SecuritySecrets" | "SecurityDeps"`
- `compareSetting` (function): `function compareSetting(direction: LooseningDirection, baseline: number | undefined, value: number | undefined): SettingComparison`
- `ExplainableConfig` (interface): `interface ExplainableConfig`
- `ExplainBaseline` (interface): `interface ExplainBaseline`
- `ExplainedCheck` (interface): `interface ExplainedCheck`
- `explainTier` (function, beta): `function explainTier(config: ExplainableConfig, baseline?: ExplainBaseline): TierExplanation`
- `LIBRARY_ONLY_CHECKS` (variable): `LIBRARY_ONLY_CHECKS: readonly TierCheckId[]`
- `library` (function, beta): `function library(overrides?: TierOverrides<LibraryCheckId>): TierConfig<LibraryCheckId>`
- `LibraryCheckId` (typealias): `type LibraryCheckId = AppCheckId | "Packaging" | "TypeResolution" | "BundledDependencies" | "QuickStart"`
- `LOOSENING_RULES` (variable): `LOOSENING_RULES: readonly LooseningRule[]`
- `Loosening` (interface): `interface Loosening`
- `LooseningDirection` (typealias): `type LooseningDirection = "higher-is-stricter" | "lower-is-stricter"`
- `LooseningRule` (interface): `interface LooseningRule`
- `PlannedCheck` (interface): `interface PlannedCheck`
- `PlannedCheckId` (typealias): `type PlannedCheckId = "DocsFragments" | "GithubActions" | "GitHygiene" | "PackedConsumer" | "EngineMatrix" | "Suppressions" | "SecurityDevDeps" | "CleanCheckout"`
- `plannedChecks` (function): `function plannedChecks(name: TierName): readonly PlannedCheck[]`
- `renderExplain` (function, beta): `function renderExplain(explanation: TierExplanation, options?: RenderExplainOptions): string`
- `RenderExplainOptions` (interface): `interface RenderExplainOptions`
- `SettingComparison` (typealias): `type SettingComparison = "stricter" | "same" | "looser"`
- `strict` (function, beta): `function strict(overrides?: TierOverrides): TierConfig<StrictCheckId>`
- `StrictCheckId` (typealias): `type StrictCheckId = LibraryCheckId | "Mutation" | "Crap" | "DistNoUrls" | "DocsMarkdown" | "Commits"`
- `TIER_NAMES` (variable): `TIER_NAMES: readonly TierName[]`
- `tier` (function, beta): `function tier(name: TierName, overrides?: TierOverrides): TierConfig<TierCheckId>`
- `tierBaseline` (function, beta): `function tierBaseline(name: TierName): ExplainBaseline`
- `TierCheck` (typealias): `type TierCheck<Dependency extends string> = CheckDefinitionConfig & { readonly dependsOn?: readonly Dependency[]; }`
- `TierCheckId` (typealias): `type TierCheckId = StrictCheckId`
- `TierCheckOptions` (interface): `interface TierCheckOptions`
- `tierChecks` (function): `function tierChecks(name: TierName): readonly TierCheckId[]`
- `TierChecks` (typealias): `type TierChecks<Id extends TierCheckId> = { readonly [K in Id]: TierCheck<Exclude<Id, K>>; }`
- `TierConfig` (interface): `interface TierConfig<Id extends TierCheckId>`
- `tierDefinition` (function): `function tierDefinition(name: TierName): TierDefinition`
- `TierDefinition` (interface): `interface TierDefinition`
- `TierExplanation` (interface): `interface TierExplanation`
- `TierMetadata` (interface): `interface TierMetadata`
- `TierName` (typealias): `type TierName = "basic" | "app" | "library" | "strict"`
- `TierOverrides` (typealias): `type TierOverrides<Id extends TierCheckId = TierCheckId> = { readonly [K in Id]?: TierCheckOptions[K] | false; }`
- `tierSettings` (function): `function tierSettings(name: TierName): TierSettings`
- `TierSettings` (interface): `interface TierSettings`
