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

/**
 * Records that a release passed the full contract: every check's verdict with a hash of its
 * evidence, the inputs and tool versions, and a digest over all of it.
 * @param input - The run's facts.
 * @returns The manifest.
 * @throws {Error} If the run was not a full, cache-bypassing one, or a check id repeats.
 */
export declare function buildEvidenceManifest(input: ManifestInput): EvidenceManifest;

export declare type CacheOutcome = "hit" | "miss" | "off";

/** One check's part in a run. */
export declare interface CheckRecord {
    readonly id: string;
    readonly durationMs: number;
    readonly verdict: Verdict;
    readonly cache?: CacheOutcome;
    readonly pillar?: Pillar;
    /** One-based shard the check ran as, when the run was sharded. */
    readonly shard?: number;
}

/**
 * Validates a run and stamps it with the schema version. Unknown fields are dropped, so a log only
 * ever holds what this version understands.
 * @param input - The run's fields.
 * @returns The record.
 * @throws {TypeError} If a field is missing or out of range.
 */
export declare function createRunRecord(input: RunRecordInput): RunRecord;

/** A signed-by-digest statement that a package version passed the full contract. */
export declare interface EvidenceManifest extends ManifestFacts {
    readonly schemaVersion: 1;
    readonly checks: readonly {
        readonly id: string;
        readonly verdict: Verdict;
        readonly evidenceSha256: string;
    }[];
    /** A digest of every other field, so an edit to any of them is detectable. */
    readonly sha256: string;
}

/** What a manifest states about a release, whichever form it is in. */
declare interface ManifestFacts {
    readonly package: {
        readonly name: string;
        readonly version: string;
    };
    /** ISO 8601 time the manifest was made. */
    readonly createdAt: string;
    /** Always `"full"`: a manifest vouches only for a run that checked everything. */
    readonly scope: "full";
    /** Always `"bypassed"`: nothing was replayed from the cache. */
    readonly cache: "bypassed";
    /** A digest of the inputs the run was computed from. */
    readonly inputHash: string;
    /** Each tool's version. */
    readonly tools: Readonly<Record<string, string>>;
}

/** What a release's full run is built from. */
export declare interface ManifestInput extends ManifestFacts {
    readonly checks: readonly {
        readonly id: string;
        readonly verdict: Verdict;
        /** The check's evidence; only its hash is kept. */
        readonly evidence: unknown;
    }[];
}

/** What checking a manifest found. */
export declare interface ManifestVerification {
    readonly ok: boolean;
    readonly problems: readonly string[];
}

/** Facts a maturity level is computed from. */
export declare interface MaturityInput {
    /** Whether any run has been recorded. */
    readonly hasRuns: boolean;
    /** How many enabled checks cover each pillar. */
    readonly pillars: Readonly<Record<Pillar, number>>;
    /** Whether the most recent full-scope run passed; `undefined` if there has been none. */
    readonly lastFullRunPassed?: boolean;
    readonly exceptions: {
        readonly count: number;
        readonly budget: number;
    };
    /** Whether the zero-tolerance policies (mutation, suppressions) are on. */
    readonly zeroTolerance: boolean;
    /** Whether the soundness canary has found no escapes; `undefined` if it has not run. */
    readonly canaryClean?: boolean;
    readonly manifestPresent: boolean;
}

/**
 * Computes a maturity level deterministically from recorded facts: 1 once there are runs and
 * correctness is covered; 2 with the security and maintainability pillars and a passing full run;
 * 3 with every pillar, exceptions within budget and zero-tolerance policies; 4 with a clean
 * soundness canary and an evidence manifest.
 * @param input - The facts to judge.
 * @returns The level, and what the next one needs.
 */
export declare function maturityLevel(input: MaturityInput): MaturityResult;

/** A maturity level, 0 to 4, and what the next one needs. */
export declare interface MaturityResult {
    readonly level: 0 | 1 | 2 | 3 | 4;
    /** Absent at level 4. */
    readonly next?: {
        readonly level: 1 | 2 | 3 | 4;
        readonly missing: readonly string[];
    };
}

/**
 * Reads a run log. A line that cannot be read is reported with its number and skipped, so one bad
 * line never hides the rest.
 * @param text - The log's content, one JSON record per line.
 * @returns The records, and what was wrong with the lines that were skipped.
 */
export declare function parseRunLog(text: string): {
    readonly records: readonly RunRecord[];
    readonly errors: readonly RunLogError[];
};

export declare type Pillar = (typeof PILLARS)[number];

/** The pillars a set of checks covers. */
export declare interface PillarCoverage {
    readonly counts: Readonly<Record<Pillar, number>>;
    /** Pillars no check covers, in the canonical order. */
    readonly missing: readonly Pillar[];
    /** Checks that declare no pillar. */
    readonly unclassified: readonly string[];
}

/**
 * @param checks - The configured checks and the pillar each declares, if any.
 * @returns Per pillar, how many checks cover it; which pillars nothing covers; which checks declare none.
 */
export declare function pillarCoverage(checks: readonly {
    readonly id: string;
    readonly pillar?: Pillar;
}[]): PillarCoverage;

/** What a check protects, so a report can show which of them a repository covers. */
export declare const PILLARS: readonly ["correctness", "security", "performance", "accessibility", "compliance", "maintainability"];

/** What went wrong reading one line of a run log. */
export declare interface RunLogError {
    readonly line: number;
    readonly message: string;
}

/** One line of the run log. */
export declare interface RunRecord extends RunRecordInput {
    readonly schemaVersion: 1;
}

/** The fields of a run record before they are validated. */
export declare interface RunRecordInput {
    /** ISO 8601 start time. */
    readonly startedAt: string;
    readonly durationMs: number;
    readonly scope: "affected" | "full";
    readonly checks: readonly CheckRecord[];
    readonly base?: string;
    /** Who produced the change: set by the caller from its own configuration, never inferred. */
    readonly actor?: "human" | "agent";
    /** Groups the runs of one change (a pull request, a branch) so a first pass can be told. */
    readonly change?: string;
    readonly changedFiles?: number;
    readonly affectedTests?: number;
    readonly totalTests?: number;
    /** The reasons the affected analysis widened. */
    readonly widenings?: readonly string[];
    readonly mutationScore?: number;
    readonly coverage?: number;
    readonly exceptions?: number;
    readonly suppressions?: number;
}

/** What a set of runs shows about speed and trust. Ratios are absent when nothing supports them. */
export declare interface RunSummary {
    readonly runs: number;
    readonly passed: number;
    readonly failed: number;
    readonly passRate?: number;
    readonly totalDurationMs: number;
    readonly failuresByCheck: Readonly<Record<string, number>>;
    readonly failuresByPillar: Readonly<Record<string, number>>;
    readonly wideningsByReason: Readonly<Record<string, number>>;
    /** Of the checks that consulted the cache, the share it answered. */
    readonly cacheHitRatio?: number;
    /** Affected tests as a share of all tests, over affected-scope runs that recorded both. */
    readonly affectedRatio?: number;
    /** Estimated minutes affected runs saved against the mean full run. */
    readonly minutesSaved?: number;
    /** The share of changes whose earliest recorded run passed. */
    readonly firstPassRate?: number;
    readonly mutationScore?: {
        readonly first: number;
        readonly latest: number;
        readonly delta: number;
    };
    readonly latestExceptions?: number;
    readonly latestSuppressions?: number;
}

/**
 * @param record - A run record.
 * @returns The record as one JSON line, newline included, ready to append to the log.
 */
export declare function serializeRunRecord(record: RunRecord): string;

/**
 * @param records - Run records, in any order.
 * @param filter - Which runs to count.
 * @returns The summary.
 */
export declare function summarizeRuns(records: readonly RunRecord[], filter?: SummaryFilter): RunSummary;

/** Which runs to count. */
export declare interface SummaryFilter {
    /** Only runs started at or after this ISO 8601 time. */
    readonly since?: string;
    readonly actor?: "human" | "agent";
}

export declare type Verdict = "pass" | "warn" | "fail";

/**
 * Checks a manifest: its digest still matches its content, it describes a full cache-bypassing
 * run, and no check failed. Given the evidence of some checks, also that each still hashes to
 * what the manifest recorded.
 * @param value - The manifest, as parsed JSON.
 * @param evidence - Optionally, the evidence of some checks by id, to check against their hashes.
 * @returns Whether it holds, and every problem found.
 */
export declare function verifyEvidenceManifest(value: unknown, evidence?: Readonly<Record<string, unknown>>): ManifestVerification;

export { }
