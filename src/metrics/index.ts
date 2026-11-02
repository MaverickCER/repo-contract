/**
 * Run records and what they show: a file-based, append-only log of what each run did, summaries of
 * speed and trust over it, which of the six pillars the configured checks cover, and a maturity
 * level computed from those facts. Pure: records come in as data and go out as text, so this
 * barrel reads no file and runs no process (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 *
 * A fourth independent public barrel, published under its own `./metrics` subpath; never
 * re-exported from the package root.
 * @packageDocumentation
 */
export { PILLARS, createRunRecord, parseRunLog, serializeRunRecord } from "./record.js"
export type {
  CacheOutcome,
  CheckRecord,
  Pillar,
  RunLogError,
  RunRecord,
  RunRecordInput,
  Verdict,
} from "./record.js"
export { pillarCoverage, summarizeRuns } from "./summary.js"
export type { PillarCoverage, RunSummary, SummaryFilter } from "./summary.js"
export { maturityLevel } from "./maturity.js"
export type { MaturityInput, MaturityResult } from "./maturity.js"
export { buildEvidenceManifest, verifyEvidenceManifest } from "./manifest.js"
export type { EvidenceManifest, ManifestInput, ManifestVerification } from "./manifest.js"
