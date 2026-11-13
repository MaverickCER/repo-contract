/**
 * Run records: an append-only log of what each contract run did, and what that log shows. It
 * summarizes speed and trust, maps the configured checks onto the six pillars, and computes a
 * maturity level from those facts.
 *
 * Pure: records come in as data and go out as text, so this barrel reads no file and runs no
 * process (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 *
 * Experimental, and published under its own `./metrics` subpath; never re-exported from the
 * package root.
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
