import { createHash, timingSafeEqual } from "node:crypto"
import type { Verdict } from "./record.js"
import { required } from "./required.js"

/** What a manifest states about a release, whichever form it is in. */
interface ManifestFacts {
  readonly package: { readonly name: string; readonly version: string }
  /** ISO 8601 time the manifest was made. */
  readonly createdAt: string
  /** Always `"full"`: a manifest vouches only for a run that checked everything. */
  readonly scope: "full"
  /** Always `"bypassed"`: nothing was replayed from the cache. */
  readonly cache: "bypassed"
  /** A digest of the inputs the run was computed from. */
  readonly inputHash: string
  /** Each tool's version. */
  readonly tools: Readonly<Record<string, string>>
  /**
   * What the run looked at: the commit it ran on and, when known, the ref. Without a subject a
   * manifest says "a full run passed" but not of what; with one, a reader can pair it with the
   * repository state it vouches for. Optional for compatibility with manifests built before it existed.
   */
  readonly subject?: {
    readonly commit: string
    readonly ref?: string
  }
}

/** What a release's full run is built from. */
export interface ManifestInput extends ManifestFacts {
  readonly checks: readonly {
    readonly id: string
    readonly verdict: Verdict
    /** The check's evidence; only its hash is kept. */
    readonly evidence: unknown
  }[]
}

/**
 * A digest-sealed statement, made by the caller, that a package version passed the full contract.
 * The `sha256` detects an accidental edit. It is not a signature: anyone who edits the content can
 * recompute it, so sign or attest the manifest to make tampering detectable.
 */
export interface EvidenceManifest extends ManifestFacts {
  readonly schemaVersion: 1
  readonly checks: readonly {
    readonly id: string
    readonly verdict: Verdict
    readonly evidenceSha256: string
  }[]
  /** A digest of every other field, so an edit that does not also recompute it is detectable. */
  readonly sha256: string
}

/** What checking a manifest found. */
export interface ManifestVerification {
  readonly ok: boolean
  readonly problems: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * @param _key - The key being serialized (unused).
 * @param value - The value being serialized.
 * @returns The value, with an object's keys put in sorted order.
 */
function sortKeys(_key: string, value: unknown): unknown {
  return isRecord(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]]),
      )
    : value
}

/**
 * @param value - Any JSON-compatible value.
 * @returns A digest that is the same for equal values whatever order their object keys came in.
 */
const digest = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(value ?? null, sortKeys))
    .digest("hex")

/**
 * @param found - A digest read from a manifest.
 * @param expected - The digest it should be.
 * @returns Whether they are equal, compared in constant time.
 */
const sameDigest = (found: unknown, expected: string): boolean =>
  typeof found === "string" &&
  found.length === expected.length &&
  timingSafeEqual(Buffer.from(found), Buffer.from(expected))

/**
 * Records that a release passed the full contract: every check's verdict with a hash of its
 * evidence, the inputs and tool versions, and a digest over all of it.
 * @param input - The run's facts.
 * @returns The manifest.
 * @throws {Error} If the run was not a full, cache-bypassing one, or a check id repeats.
 */
export function buildEvidenceManifest(input: ManifestInput): EvidenceManifest {
  const scope: string = input.scope
  const cache: string = input.cache
  if (scope !== "full") throw new Error("A manifest describes a full-scope run.")
  if (cache !== "bypassed") throw new Error("A manifest describes a run that bypassed the cache.")
  const tools = new Map(Object.entries(input.tools))
  const byId = new Map<string, ManifestInput["checks"][number]>()
  for (const check of input.checks) {
    if (byId.has(check.id)) throw new Error(`Check ${check.id} appears more than once.`)
    byId.set(check.id, check)
  }
  if (input.subject !== undefined && !/^[0-9a-f]{7,64}$/i.test(input.subject.commit)) {
    throw new Error("A manifest's subject commit is a hexadecimal object id.")
  }
  const subject =
    input.subject === undefined
      ? {}
      : {
          subject: {
            commit: input.subject.commit,
            ...(input.subject.ref === undefined ? {} : { ref: input.subject.ref }),
          },
        }
  const body = {
    schemaVersion: 1 as const,
    package: { name: input.package.name, version: input.package.version },
    createdAt: input.createdAt,
    scope: input.scope,
    cache: input.cache,
    inputHash: input.inputHash,
    ...subject,
    tools: Object.fromEntries(
      [...tools.keys()].sort().map((name) => [name, required(tools, name)]),
    ),
    checks: [...byId.keys()].sort().map((id) => {
      const { verdict, evidence } = required(byId, id)
      return { id, verdict, evidenceSha256: digest(evidence) }
    }),
  }
  return { ...body, sha256: digest(body) }
}

/**
 * Checks a manifest: its digest still matches its content, it describes a full cache-bypassing
 * run, and no check failed. Given the evidence of some checks, also that each still hashes to
 * what the manifest recorded.
 * @param value - The manifest, as parsed JSON.
 * @param evidence - Optionally, the evidence of some checks by id, to check against their hashes.
 * @returns Whether it holds, and every problem found.
 */
export function verifyEvidenceManifest(
  value: unknown,
  evidence: Readonly<Record<string, unknown>> = {},
): ManifestVerification {
  if (!isRecord(value)) return { ok: false, problems: ["The manifest is not an object."] }
  if (value.schemaVersion !== 1) {
    return {
      ok: false,
      problems: [`The manifest uses schema version ${String(value.schemaVersion)}, not 1.`],
    }
  }
  if (!Array.isArray(value.checks))
    return { ok: false, problems: ["The manifest has no check list."] }
  const problems: string[] = []
  const { sha256, ...body } = value
  if (!sameDigest(sha256, digest(body)))
    problems.push("The manifest's digest does not match its content.")
  if (value.scope !== "full") problems.push("The manifest does not describe a full-scope run.")
  if (value.cache !== "bypassed")
    problems.push("The manifest does not describe a cache-bypassing run.")
  const checks = value.checks as readonly Record<string, unknown>[]
  for (const check of checks) {
    if (check.verdict === "fail") problems.push(`Check ${String(check.id)} failed.`)
  }
  for (const [id, content] of Object.entries(evidence)) {
    const recorded = checks.find((check) => check.id === id)
    if (recorded === undefined) problems.push(`The manifest has no check ${id}.`)
    else if (!sameDigest(recorded.evidenceSha256, digest(content))) {
      problems.push(`The evidence for ${id} does not match the manifest.`)
    }
  }
  return { ok: problems.length === 0, problems }
}
