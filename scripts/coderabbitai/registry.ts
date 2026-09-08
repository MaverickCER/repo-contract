import { createHash } from "node:crypto"
import type { CoderabbitExceptionRecord, NormalizedFinding } from "./evidence-types.js"
import {
  EXCEPTION_TYPES,
  SECURITY_EXCEPTION_FIELD_KEYS,
  validateSecurityExceptionFields,
} from "../shared/exception-record.js"
import type { ExceptionRegistrySchema, ExceptionType } from "../shared/exception-record.js"

export type { CoderabbitExceptionRecord } from "./evidence-types.js"

const SEVERITY_VALUES = new Set(["critical", "major", "minor", "unknown"])

/**
 * `"validated-false-positive"` is excluded from a CodeRabbit exception's allowed set -- unlike a
 * deterministic scanner, there is no more-authoritative tool to mechanically re-run against an
 * AI-generated finding to confirm it "doesn't actually apply". A CodeRabbit finding judged
 * incorrect is still only ever dismissed via `"accepted-risk"` / `"tooling-limitation"` / etc.,
 * backed by `method: "independent-human-review"`.
 */
export const CODERABBIT_EXCEPTION_TYPES: readonly ExceptionType[] = EXCEPTION_TYPES.filter(
  (type) => type !== "validated-false-positive",
)

/**
 * The check-namespaced semantic identity of one CodeRabbit finding:
 * `coderabbit:<file>:<severity>:<12-hex-char sha256 of the trimmed summary>`. Injective over a run
 * (two findings with identical file+severity+summary are true duplicates); churns across a
 * re-review whose summary prose changed.
 * @param finding - The finding's (or record's) identity fields.
 * @param finding.file - The finding's file path, verbatim from CodeRabbit.
 * @param finding.severity - The normalized severity tier.
 * @param finding.summary - The finding's descriptive text (hashed into the id).
 * @returns The semantic id.
 */
export function deriveCoderabbitExceptionId(finding: {
  readonly file: string
  readonly severity: string
  readonly summary: string
}): string {
  const hash = createHash("sha256").update(finding.summary.trim()).digest("hex").slice(0, 12)
  return `coderabbit:${finding.file}:${finding.severity}:${hash}`
}

/**
 * Builds a fresh, blank exception record for a finding with no matching record yet.
 * @param finding - The unmatched finding.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createCoderabbitStub(
  finding: NormalizedFinding,
  id: string,
): CoderabbitExceptionRecord {
  return {
    id,
    version: 1,
    justification: "",
    alternatives: "",
    remediation: "",
    method: "",
    exceptionType: "",
    file: finding.file,
    severity: finding.severity,
    summary: finding.summary,
  }
}

/** The per-registry schema for coderabbit.json. */
export const CODERABBIT_EXCEPTION_SCHEMA: ExceptionRegistrySchema<CoderabbitExceptionRecord> = {
  namespace: "coderabbit:",
  metadataKeys: [...SECURITY_EXCEPTION_FIELD_KEYS, "file", "severity", "summary"],
  validateRecord(core, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { file, severity, summary } = raw

    const fileValid = typeof file === "string" && file.length > 0
    if (!fileValid) errors.push(`${at}.file must be a non-empty string.`)
    const severityValid = typeof severity === "string" && SEVERITY_VALUES.has(severity)
    if (!severityValid) {
      errors.push(
        `${at}.severity must be one of ${[...SEVERITY_VALUES].map((s) => JSON.stringify(s)).join(", ")} (got ${JSON.stringify(severity)}).`,
      )
    }
    const summaryValid = typeof summary === "string" && summary.length > 0
    if (!summaryValid) errors.push(`${at}.summary must be a non-empty string.`)

    const security = validateSecurityExceptionFields(raw, index, CODERABBIT_EXCEPTION_TYPES, errors)
    if (security?.method === "mechanical-reverification") {
      errors.push(
        `${at}.method must be "independent-human-review" for a CodeRabbit waiver -- there is no tool this check can mechanically re-run to substantiate dismissing an AI-generated finding (ADR 0014).`,
      )
      return undefined
    }

    if (!fileValid || !severityValid || !summaryValid || security === undefined) return undefined

    const identity = { file: file, severity: severity, summary: summary }
    const derived = deriveCoderabbitExceptionId(identity)
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own file/severity/summary (${JSON.stringify(derived)}).`,
      )
      return undefined
    }

    return {
      id: core.id,
      version: 1,
      justification: core.justification,
      ...security,
      file: file,
      severity: severity as CoderabbitExceptionRecord["severity"],
      summary: summary,
    }
  },
}
