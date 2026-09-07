import path from "node:path"
import {
  evaluateExceptionRecord,
  loadExceptionRegistry,
  validateExceptionPolicyConfig,
} from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  NormalizedSocketAlert,
  SecuritySocketEvidence,
} from "../scripts/security-socket/evidence-types.js"
import {
  SOCKET_GLOBAL_DEFAULT_POLICY,
  VALID_SOCKET_REQUIREMENTS,
  socketPolicy,
} from "../scripts/security-socket/policy-config.js"
import type { SocketExceptionRecord } from "../scripts/security-socket/registry.js"
import { validateSocketExceptionRegistry } from "../scripts/security-socket/registry.js"
import { isVerified } from "../scripts/shared/exception-record.js"
import {
  evaluateExceptionFindings,
  stageMissingFields,
} from "./shared/evaluate-exception-findings.js"
import { handWrittenArraySchema } from "./shared/standard-schema-validator.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

const VERIFICATION_FIELD = "verification.verifiedBy"
/** `justification`/`alternatives`/`remediation`/`exceptionType` -- the content a verification's hash is bound to. Excludes `VERIFICATION_FIELD` itself: a verification cannot be bound to its own presence. */
const PROSE_REQUIREMENTS = VALID_SOCKET_REQUIREMENTS.filter((field) => field !== VERIFICATION_FIELD)

const DEFAULT_EXCEPTIONS_PATH = path.join(".repo-contract", "exceptions", "socket.json")

/**
 * Resolves one named field's current value on a `SocketExceptionRecord` -- the four ordinary
 * prose/enum fields read directly; `"verification.verifiedBy"` delegates to `isVerified`
 * (`checks/shared/exception-record.ts`), returning the verifier's own name only when the record's
 * `verification` block is present *and* still content-bound to the record's current prose (see
 * that function's own doc comment for what "content-bound" means).
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value, or `""` if empty/absent/unverified.
 */
function socketFieldValue(record: SocketExceptionRecord, requirement: string): string {
  if (requirement === VERIFICATION_FIELD) {
    return isVerified(record, PROSE_REQUIREMENTS, socketFieldValue)
      ? (record.verification?.verifiedBy ?? "")
      : ""
  }
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Finds the (at most one) registry record backing `alert` -- by exact `id` match, the same
 * `` `${package}@${version}:${type}` `` identity both `NormalizedSocketAlert` and
 * `SocketExceptionRecord` share.
 * @param alert - The alert to find a backing record for.
 * @param records - This run's loaded exception registry.
 * @returns The matching record, or `undefined` if none backs this alert.
 */
function matchAlertToRecord(
  alert: NormalizedSocketAlert,
  records: readonly SocketExceptionRecord[],
): SocketExceptionRecord | undefined {
  return records.find((record) => record.id === alert.id)
}

/**
 * Evaluates one already-matched `(alert, record)` pair against `socketPolicy` -- classified purely
 * on the alert's own normalized `severity`.
 * @param alert - The alert being evaluated.
 * @param record - The registry record `matchAlertToRecord` found for `alert`.
 * @returns The record's resolved verdict and any still-missing required fields.
 */
function evaluateAlert(
  alert: NormalizedSocketAlert,
  record: SocketExceptionRecord,
): ReturnType<typeof evaluateExceptionRecord<SocketExceptionRecord>> {
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "socket", category: alert.severity },
  ]
  return evaluateExceptionRecord({
    record,
    classifications,
    config: socketPolicy,
    globalDefault: SOCKET_GLOBAL_DEFAULT_POLICY,
    fieldValue: socketFieldValue,
  })
}

interface EvaluateSecuritySocketPolicyInput {
  readonly evidence: SecuritySocketEvidence
  readonly exceptionsPath?: string
  /** Overridable for tests -- defaults to reading the real `.repo-contract/exceptions/socket.json`. */
  readonly loadRegistry?: (
    exceptionsPath: string,
  ) => Promise<
    | { readonly ok: true; readonly records: readonly SocketExceptionRecord[] }
    | { readonly ok: false; readonly errors: readonly string[] }
  >
}

/**
 * The real `.repo-contract/exceptions/socket.json` loader -- `evaluateSecuritySocketPolicy`'s own
 * default `loadRegistry`, overridable in tests so they never touch the filesystem.
 * @param exceptionsPath - Path to the exceptions registry file.
 * @returns The loaded registry records, or the errors found validating it.
 */
async function defaultLoadRegistry(
  exceptionsPath: string,
): Promise<
  | { readonly ok: true; readonly records: readonly SocketExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] }
> {
  const result = await loadExceptionRegistry<SocketExceptionRecord>({
    path: exceptionsPath,
    schema: handWrittenArraySchema(validateSocketExceptionRegistry),
  })
  return result.ok ? { ok: true, records: result.records } : { ok: false, errors: result.errors }
}

/**
 * Evaluates the `security-socket` check's own emitted evidence -- `unavailable` (CLI not
 * installed, not authenticated, or unreachable) is a `warn`, never a `fail`: this check cannot
 * distinguish "genuinely clean" from "never actually ran" on its own, so it says so rather than
 * claiming a pass it didn't earn. `error` (a malformed or unrecognized report) fails closed. A
 * clean scan (`passed`) or every alert permitted (`failed` with all determinants `permitted`)
 * passes; any `forbidden`/`insufficient` verdict or unmatched alert fails, listed individually.
 * @param input - The evidence to evaluate, and (for tests) the exceptions-registry path/loader to use.
 * @returns The check's `PolicyResult`.
 */
export async function evaluateSecuritySocketPolicy(
  input: EvaluateSecuritySocketPolicyInput,
): Promise<PolicyResult> {
  const {
    evidence,
    exceptionsPath = DEFAULT_EXCEPTIONS_PATH,
    loadRegistry = defaultLoadRegistry,
  } = input

  if (evidence.status === "unavailable") {
    return {
      outcome: "warn",
      rationale: `security-socket did not run (${evidence.reason}) -- alerts were not evaluated. Install and authenticate @socketsecurity/cli to enable real enforcement.`,
    }
  }

  if (evidence.status === "error") {
    return { outcome: "fail", rationale: `security-socket scan failed: ${evidence.message}` }
  }

  if (evidence.status === "passed") {
    return { outcome: "pass", rationale: "socket ci reported 0 alerts." }
  }

  const configErrors = validateExceptionPolicyConfig(socketPolicy, VALID_SOCKET_REQUIREMENTS)
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: ["socketPolicy is misconfigured:", ...configErrors.map((e) => `- ${e}`)].join(
        "\n",
      ),
    }
  }

  const registry = await loadRegistry(exceptionsPath)
  if (!registry.ok) {
    return {
      outcome: "fail",
      rationale: [
        `${exceptionsPath} failed validation:`,
        ...registry.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const { matched, unmatchedFindings, staleExceptions, summary } = evaluateExceptionFindings({
    items: evidence.alerts,
    records: registry.records,
    matchRecord: matchAlertToRecord,
    evaluate: evaluateAlert,
  })

  const offenders = matched.filter(({ determinant }) => determinant.verdict !== "permitted")

  if (offenders.length === 0 && unmatchedFindings.length === 0) {
    const staleNote =
      staleExceptions.length > 0
        ? ` ${String(staleExceptions.length)} exception record(s) matched nothing this run: ${staleExceptions.map((r) => r.id).join(", ")}.`
        : ""
    return { outcome: "pass", rationale: `${summary}${staleNote}` }
  }

  const offenderLines = offenders.map(({ item, determinant }) => {
    const staged = stageMissingFields(determinant.missing, VERIFICATION_FIELD)
    const detail =
      determinant.verdict === "forbidden"
        ? "forbidden by policy"
        : `insufficient (missing: ${staged.join(", ")})`
    return `- ${item.id} [${item.severity}]: ${detail}`
  })

  const unmatchedLines = unmatchedFindings.map(
    (alert) => `- ${alert.id} [${alert.severity}]: no matching exception record`,
  )

  return {
    outcome: "fail",
    rationale: [summary, ...offenderLines, ...unmatchedLines].join("\n"),
  }
}

// Rejects any alert above a medium (Socket "middle") rating outright, and requires a
// finding-specific, *verified* exception (checks/shared/exception-record.ts) for everything else
// -- see specs/decisions/0013-reusable-exception-policy-helper.md's "Verification, not
// attestation". `@socketsecurity/cli`'s own real output for an authenticated org scan with policy
// violations could not be verified against a real org in this environment -- see
// scripts/security-socket/evidence-types.ts's own doc comment.
export const securitySocket: CheckDefinitionConfig = {
  run: ["tsx", "scripts/security-socket/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<SecuritySocketEvidence>(
      result.output,
      "security-socket check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSecuritySocketPolicy({ evidence: parsed.value })
  },
}
