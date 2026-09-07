import {
  evaluateExceptionRecord,
  loadExceptionRegistry,
  validateExceptionPolicyConfig,
} from "../src/helpers/index.js"
import type { ExceptionClassification } from "../src/helpers/index.js"
import type {
  NetworkCapabilityFinding,
  NetworkScanEvidence,
} from "../scripts/security-network/evidence-types.js"
import {
  SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY,
  VALID_SECURITY_NETWORK_REQUIREMENTS,
  securityNetworkPolicy,
} from "../scripts/security-network/policy-config.js"
import type { NetworkExceptionRecord } from "../scripts/security-network/registry.js"
import {
  deriveNetworkExceptionId,
  validateNetworkExceptionRegistry,
} from "../scripts/security-network/registry.js"
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
const PROSE_REQUIREMENTS = VALID_SECURITY_NETWORK_REQUIREMENTS.filter(
  (field) => field !== VERIFICATION_FIELD,
)

// A forward-slash repo-relative literal, not `path.join` -- this string is shown verbatim in the
// check's own rationale (pointing a reader at the file to edit), where a back-slashed Windows
// rendering would be wrong, and `node:fs` accepts `/` on every platform for the actual read.
const DEFAULT_EXCEPTIONS_PATH = ".repo-contract/exceptions/security-network.json"

/**
 * The one identity a `NetworkCapabilityFinding` and its (at most one) backing
 * `NetworkExceptionRecord` share -- `` `${capability}:${file}:${line}` ``, deliberately identical
 * to `deriveNetworkExceptionId` so a record's stored `id` is also its direct match key. `column`
 * is intentionally excluded (a documented coarsening -- two findings of the same capability on the
 * same line share one record), matching the plan's `capability`+`file`+`line` waiver identity.
 * @param finding - The finding to derive a match key for.
 * @returns The finding's canonical identity.
 */
function findingIdentity(finding: NetworkCapabilityFinding): string {
  return `${finding.capability}:${finding.file}:${String(finding.line)}`
}

/**
 * Resolves one named field's current value on a `NetworkExceptionRecord` -- the four ordinary
 * prose/enum fields read directly; `"verification.verifiedBy"` delegates to `isVerified`
 * (`scripts/shared/exception-record.ts`), returning the verifier's own name only when the
 * record's `verification` block is present *and* still content-bound to the record's current
 * prose.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value, or `""` if empty/absent/unverified.
 */
function networkFieldValue(record: NetworkExceptionRecord, requirement: string): string {
  if (requirement === VERIFICATION_FIELD) {
    return isVerified(record, PROSE_REQUIREMENTS, networkFieldValue)
      ? (record.verification?.verifiedBy ?? "")
      : ""
  }
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * Finds the (at most one) registry record backing `finding` -- by exact `id` match on the
 * `` `${capability}:${file}:${line}` `` identity both sides share.
 * @param finding - The finding to find a backing record for.
 * @param records - This run's loaded exception registry.
 * @returns The matching record, or `undefined` if none backs this finding.
 */
function matchFindingToRecord(
  finding: NetworkCapabilityFinding,
  records: readonly NetworkExceptionRecord[],
): NetworkExceptionRecord | undefined {
  const identity = findingIdentity(finding)
  return records.find((record) => deriveNetworkExceptionId(record) === identity)
}

/**
 * Evaluates one already-matched `(finding, record)` pair against `securityNetworkPolicy` --
 * classified purely on the finding's own `capability` kind.
 * @param finding - The finding being evaluated.
 * @param record - The registry record `matchFindingToRecord` found for `finding`.
 * @returns The record's resolved verdict and any still-missing required fields.
 */
function evaluateFinding(
  finding: NetworkCapabilityFinding,
  record: NetworkExceptionRecord,
): ReturnType<typeof evaluateExceptionRecord<NetworkExceptionRecord>> {
  const classifications: readonly [ExceptionClassification, ...ExceptionClassification[]] = [
    { group: "security-network", category: finding.capability },
  ]
  return evaluateExceptionRecord({
    record,
    classifications,
    config: securityNetworkPolicy,
    globalDefault: SECURITY_NETWORK_GLOBAL_DEFAULT_POLICY,
    fieldValue: networkFieldValue,
  })
}

/**
 * Renders one finding exactly as this check has always listed one in its rationale --
 * `file:line:column [capability] detail`.
 * @param finding - The finding to render.
 * @returns The single-line rendering.
 */
function renderFinding(finding: NetworkCapabilityFinding): string {
  return `${finding.file}:${String(finding.line)}:${String(finding.column)} [${finding.capability}] ${finding.detail}`
}

interface EvaluateSecurityNetworkPolicyInput {
  readonly evidence: NetworkScanEvidence
  readonly exceptionsPath?: string
  /** Overridable for tests -- defaults to reading the real `.repo-contract/exceptions/security-network.json`. */
  readonly loadRegistry?: (
    exceptionsPath: string,
  ) => Promise<
    | { readonly ok: true; readonly records: readonly NetworkExceptionRecord[] }
    | { readonly ok: false; readonly errors: readonly string[] }
  >
}

/**
 * The real `.repo-contract/exceptions/security-network.json` loader -- `evaluateSecurityNetworkPolicy`'s
 * own default `loadRegistry`, overridable in tests so they never touch the filesystem.
 * @param exceptionsPath - Path to the exceptions registry file.
 * @returns The loaded registry records, or the errors found validating it.
 */
async function defaultLoadRegistry(
  exceptionsPath: string,
): Promise<
  | { readonly ok: true; readonly records: readonly NetworkExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] }
> {
  const result = await loadExceptionRegistry<NetworkExceptionRecord>({
    path: exceptionsPath,
    schema: handWrittenArraySchema(validateNetworkExceptionRegistry),
  })
  return result.ok ? { ok: true, records: result.records } : { ok: false, errors: result.errors }
}

/**
 * Fails whenever scripts/security-network/scan.ts found any prohibited (or unverifiable) network
 * capability in `src/**\/*.ts` that is not backed by a finding-specific, *verified* exception
 * record (`.repo-contract/exceptions/security-network.json`). ADR 0007's default posture is
 * unchanged and absolute -- `securityNetworkPolicy`'s `default` is `forbidden`, and the reviewed
 * waiver path additionally requires an `exceptionType`, a content-bound `verification.verifiedBy`,
 * and (for a false-positive claim) a mechanical re-scan; see
 * specs/decisions/0013-reusable-exception-policy-helper.md's "Verification, not attestation" and
 * specs/decisions/0007-no-network-surface.md's own amendment. A zero-file scan still fails (a
 * clean result from an empty scan is not evidence of a network-free surface).
 * @param input - The evidence to evaluate, and (for tests) the exceptions-registry path/loader to use.
 * @returns the pass/fail outcome and its rationale.
 */
export async function evaluateSecurityNetworkPolicy(
  input: EvaluateSecurityNetworkPolicyInput,
): Promise<PolicyResult> {
  const {
    evidence,
    exceptionsPath = DEFAULT_EXCEPTIONS_PATH,
    loadRegistry = defaultLoadRegistry,
  } = input

  if (evidence.filesScanned === 0) {
    return {
      outcome: "fail",
      rationale:
        "security-network scan reported zero files scanned under src/ -- a clean result from an " +
        "empty scan is not evidence of a network-free surface. Check the scan's file discovery.",
    }
  }

  const configErrors = validateExceptionPolicyConfig(
    securityNetworkPolicy,
    VALID_SECURITY_NETWORK_REQUIREMENTS,
  )
  if (configErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "securityNetworkPolicy is misconfigured:",
        ...configErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  // Loaded before the zero-findings check below so a stale record (its underlying finding is
  // gone) still surfaces on an otherwise-clean run -- the drift signal would be unreachable in
  // its most common case otherwise.
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
    items: evidence.findings,
    records: registry.records,
    matchRecord: matchFindingToRecord,
    evaluate: evaluateFinding,
  })

  const staleNote =
    staleExceptions.length > 0
      ? ` ${String(staleExceptions.length)} exception record(s) in ${exceptionsPath} matched nothing this run: ${staleExceptions.map((r) => r.id).join(", ")}.`
      : ""

  if (evidence.findings.length === 0) {
    return {
      outcome: "pass",
      rationale:
        `No prohibited network capability found across ${String(evidence.filesScanned)} file(s) under src/.` +
        staleNote,
    }
  }

  const offenders = matched.filter(({ determinant }) => determinant.verdict !== "permitted")

  if (offenders.length === 0 && unmatchedFindings.length === 0) {
    return {
      outcome: "pass",
      rationale:
        `Every network capability finding across ${String(evidence.filesScanned)} file(s) under src/ is backed by a verified exception. ${summary}` +
        staleNote,
    }
  }

  const failingCount = offenders.length + unmatchedFindings.length

  const offenderLines = offenders.map(({ item, determinant }) => {
    const staged = stageMissingFields(determinant.missing, VERIFICATION_FIELD)
    const detail =
      determinant.verdict === "forbidden"
        ? "forbidden by policy (no waiver path for this capability kind)"
        : `exception insufficient (missing: ${staged.join(", ")})`
    return `- ${renderFinding(item)} -- ${detail}`
  })

  const unmatchedLines = unmatchedFindings.map(
    (finding) => `- ${renderFinding(finding)} -- no matching exception record`,
  )

  return {
    outcome: "fail",
    rationale: [
      `${String(failingCount)} prohibited or unverifiable network capability finding(s) ` +
        `across ${String(evidence.filesScanned)} file(s) scanned under src/:`,
      ...offenderLines,
      ...unmatchedLines,
      "src/ must never perform network I/O directly -- see SECURITY.md's network-free surface " +
        "guarantee. A genuine, reviewed exception requires a finding-specific, verified record in " +
        `${DEFAULT_EXCEPTIONS_PATH} (justification, alternatives, remediation, exceptionType, and a ` +
        "content-bound verification -- see specs/decisions/0013-reusable-exception-policy-helper.md); " +
        "a new preset command still needs adding to scripts/security-network/network-surface.mjs's " +
        "ALLOWED_PRESET_COMMANDS." +
        staleNote,
    ].join("\n"),
  }
}

// Second, independent layer of the "no network calls" invariant -- see eslint.config.js's own doc
// comment on the first (ESLint) layer, and specs/decisions/0007-no-network-surface.md for the full
// threat model. This check's own script (scripts/security-network/scan.ts) never invokes ESLint,
// so a silently weakened/removed ESLint rule or a suppressed violation still fails here.
export const securityNetwork: CheckDefinitionConfig = {
  run: ["tsx", "scripts/security-network/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<NetworkScanEvidence>(
      result.output,
      "security-network check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateSecurityNetworkPolicy({ evidence: parsed.value })
  },
}
