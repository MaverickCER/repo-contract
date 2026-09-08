// Entry point for the "security-socket" self-hosting check, invoked via
// `run: ["tsx", "scripts/security-socket/scan.ts"]` in repo-contract.config.ts. Prints ONLY the
// JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/suppression-governance/check.ts's own stdout contract.
//
// Report-only, like every other self-hosting scan script in this repository: this script's own
// exit code is never the pass/fail signal (checks/security-socket.ts's policy, reading this same
// evidence, is) -- it always exits 0 once it has produced *some* well-formed evidence, including
// `status: "unavailable"`/`"error"`.

import { sync as spawnSync } from "cross-spawn"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  loadExceptionRegistry,
  reconcileExceptions,
  writeExceptionRegistry,
} from "../../src/helpers/index.js"
import type { StandardSchemaV1 } from "../../src/helpers/index.js"
import { asFlatExceptionRecords, validateExceptionRegistry } from "../shared/exception-record.js"
import type {
  NormalizedSocketAlert,
  SecuritySocketEvidence,
  SocketExceptionRecord,
} from "./evidence-types.js"
import { SOCKET_EXCEPTION_SCHEMA, createSocketStub } from "./registry.js"

const REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/socket.json"

/** The raw result of running the Socket CLI, before any registry reconciliation. */
type SocketCliResult =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly alerts: readonly NormalizedSocketAlert[] }
  | {
      readonly status: "unavailable"
      readonly reason: "cli-not-installed" | "not-authenticated" | "network-unreachable"
    }
  | { readonly status: "error"; readonly message: string }

const registrySchema: StandardSchemaV1<unknown, readonly SocketExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const result = validateExceptionRegistry(value, SOCKET_EXCEPTION_SCHEMA)
      return result.ok
        ? { value: result.records }
        : { issues: result.errors.map((message) => ({ message })) }
    },
  },
}

// `--no-banner`/`--no-spinner` keep stdout free of Socket's own decorative ASCII banner and
// spinner control codes -- confirmed directly (against a real, unauthenticated, installed
// `@socketsecurity/cli`) that `--json` alone already suppresses the banner for `socket ci`
// specifically, but not reliably for every subcommand (`socket scan create --json` still printed
// `⚠`/`ℹ`/`✖` decoration lines ahead of its JSON blob in the same manual check) -- both flags are
// included so this wrapper's stdout-parsing contract doesn't depend on which subcommand's own
// undocumented-elsewhere suppression behavior happens to be in effect.
const SOCKET_ARGS = ["ci", "--json", "--no-banner", "--no-spinner"]

const SEVERITY_VALUES = new Set(["critical", "high", "middle", "low"])

/**
 * Whether `value` is a non-null, non-array object -- the same defensive shape guard
 * `src/helpers/exception-policy.ts`'s own `isPlainObject` uses, duplicated here rather than
 * imported: this script is self-hosting tooling outside `src/`, and importing an internal
 * (unpublished) helper from a sibling check's own script would be exactly the kind of
 * cross-check-script coupling `specs/architecture.md`'s module boundaries avoid.
 * @param value - The candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * `value` if it's a `string`, else `""` -- avoids ever stringifying an unrelated object/array via
 * `String()`'s default `[object Object]` coercion.
 * @param value - The candidate value.
 * @returns `value` narrowed to `string`, or `""`.
 */
function safeString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * Extracts and parses the trailing JSON object from `stdout` -- `socket ci --json` was confirmed
 * to print pure JSON with no leading decoration, but a defensive fallback (find the last `{` and
 * parse from there) is kept in case a future CLI version -- or a subcommand this wrapper doesn't
 * currently use -- prints a leading warning line the way `socket scan create --json` does. Returns
 * `undefined` if no parseable JSON object can be found at all.
 * @param stdout - The CLI's raw captured stdout.
 * @returns The parsed value, or `undefined` if `stdout` contains no parseable JSON object.
 */
function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.lastIndexOf("{")
    if (start === -1) return undefined
    try {
      return JSON.parse(trimmed.slice(start))
    } catch {
      return undefined
    }
  }
}

/**
 * Recognizes the exact "not authenticated" JSON envelope confirmed by direct observation against
 * a real, unauthenticated `socket ci --json` run: `{ "ok": false, "message": "Auth Error", "cause":
 * "You need to provide an API token. Run \`socket login\` first." }`. Matched by `message` alone
 * (a fixed, deliberate CLI-facing string) rather than the free-text `cause`, which is more likely
 * to be reworded across CLI versions.
 * @param parsed - The parsed JSON value to check.
 * @returns `true` if `parsed` is Socket's own "not authenticated" error envelope.
 */
function isAuthError(parsed: unknown): boolean {
  return (
    isPlainObject(parsed) &&
    parsed.ok === false &&
    (parsed.message === "Auth Error" || parsed.message === "AuthError")
  )
}

/**
 * A best-effort recognizer for a network-reachability failure -- unlike `isAuthError` above, this
 * was never directly observed against a real run (this environment has outbound network access),
 * so it only matches conservatively-specific signals (`ENOTFOUND`/`ETIMEDOUT`/`ECONNREFUSED`/
 * `ECONNRESET` in stderr, or an explicit "network" mention in a parsed `ok: false` envelope's own
 * message/cause)
 * rather than guessing broadly -- anything else unrecognized falls through to `status: "error"`
 * instead of being misreported as a transient, retriable network condition.
 * @param stderr - The CLI process's captured stderr.
 * @param parsed - The parsed stdout JSON value, if any.
 * @returns `true` if a network-reachability failure is confidently recognized.
 */
function isNetworkUnreachable(stderr: string, parsed: unknown): boolean {
  const NETWORK_ERROR_CODES = /\b(ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET)\b/
  if (NETWORK_ERROR_CODES.test(stderr)) return true

  if (isPlainObject(parsed) && parsed.ok === false) {
    const text = `${safeString(parsed.message)} ${safeString(parsed.cause)} ${safeString(parsed.data)}`
    return /network|unreachable|could not connect/i.test(text)
  }

  return false
}

/**
 * Normalizes one raw alert entry from a real, authenticated scan's report. Deliberately
 * conservative: an entry missing any of `package`/`version`/`type` is rejected outright (the
 * caller treats any rejection as `status: "error"` for the whole report -- see this module's own
 * doc comment on why the authenticated-alert shape is unverified in this environment and this
 * parsing path stays maximally defensive).
 * @param raw - One candidate alert entry from the parsed report.
 * @returns The normalized alert, or `undefined` if `raw` doesn't match the minimum recognized shape.
 */
function normalizeAlert(raw: unknown): NormalizedSocketAlert | undefined {
  if (!isPlainObject(raw)) return undefined

  const packageName = raw.package ?? raw.name
  const { version, type } = raw
  const severityRaw = raw.severity

  if (typeof packageName !== "string" || packageName.length === 0) return undefined
  if (typeof version !== "string" || version.length === 0) return undefined
  if (typeof type !== "string" || type.length === 0) return undefined

  const severity =
    typeof severityRaw === "string" && SEVERITY_VALUES.has(severityRaw.toLowerCase())
      ? (severityRaw.toLowerCase() as "critical" | "high" | "middle" | "low")
      : "unknown"

  const action = typeof raw.action === "string" ? raw.action : undefined

  return {
    id: `${packageName}@${version}:${type}`,
    package: packageName,
    version,
    type,
    severity,
    ...(action !== undefined ? { action } : {}),
  }
}

/**
 * Runs `socket ci --json` and normalizes its result. Never throws -- every recognized or
 * unrecognized outcome becomes a well-formed `SocketCliResult` value instead.
 * @returns This run's normalized CLI result.
 */
function runSocketCli(): SocketCliResult {
  const result = spawnSync("socket", SOCKET_ARGS, {
    encoding: "utf8",
    // `socket ci` uploads a manifest and waits for the server-side scan+report; 5 min is a
    // generous ceiling that still bounds a stalled invocation so it can never hang
    // `runSecuritySocketScan`, `npm run contract`, or the pre-push hook. `cross-spawn` forwards
    // this straight to `child_process.spawnSync`. A timeout is classified `status: "error"`, NOT
    // `unavailable: network-unreachable` -- exceeding the deadline is not itself evidence the
    // network was unreachable (a slow-but-reachable server hits it too), so it fails closed.
    timeout: 5 * 60 * 1000,
    // `SIGKILL` (not the default `SIGTERM`): a wedged `socket` process that ignores or slowly
    // handles `SIGTERM` would keep `spawnSync` blocked past the deadline anyway.
    killSignal: "SIGKILL",
    // The `--json` report is a single object; well under the 1 MiB `spawnSync` default, but
    // raised clear of it so a large SBOM report can never be misreported as a spawn failure.
    maxBuffer: 32 * 1024 * 1024,
  })

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return { status: "unavailable", reason: "cli-not-installed" }
    }
    if (nodeError.code === "ETIMEDOUT") {
      return { status: "error", message: "The `socket` CLI timed out (exceeded 5 minutes)." }
    }
    if (nodeError.code === "ENOBUFS") {
      return {
        status: "error",
        message: "The `socket` CLI produced more output than its buffer limit.",
      }
    }
    return { status: "error", message: `Failed to spawn the \`socket\` CLI: ${nodeError.message}` }
  }

  const stdout = result.stdout
  const stderr = result.stderr
  const parsed = extractJson(stdout)

  if (isAuthError(parsed)) {
    return { status: "unavailable", reason: "not-authenticated" }
  }

  if (isNetworkUnreachable(stderr, parsed)) {
    return { status: "unavailable", reason: "network-unreachable" }
  }

  if (parsed === undefined) {
    return {
      status: "error",
      message: `\`socket ci --json\` produced no parseable JSON output (exit code ${String(result.status)}).`,
    }
  }

  if (!isPlainObject(parsed) || typeof parsed.ok !== "boolean") {
    return {
      status: "error",
      message: '`socket ci --json` produced JSON with no recognized "ok" boolean field.',
    }
  }

  if (!parsed.ok) {
    const detail =
      typeof parsed.message === "string"
        ? parsed.message
        : "socket ci reported an unrecognized failure."
    return { status: "error", message: detail }
  }

  // `ok: true` -- the scan completed. A real report's own alerts field (once confirmed against an
  // authenticated org -- see this module's own doc comment) is expected under `data.alerts` or
  // `alerts`; either shape (or its absence, meaning a clean scan) is accepted here, but any
  // present value that isn't an array of individually-recognized alert entries fails closed.
  const rawAlerts =
    (isPlainObject(parsed.data) ? parsed.data.alerts : undefined) ?? parsed.alerts ?? []

  if (!Array.isArray(rawAlerts)) {
    return {
      status: "error",
      message: '`socket ci --json` reported `ok: true` with a non-array "alerts" field.',
    }
  }

  if (rawAlerts.length === 0) {
    return { status: "passed" }
  }

  const normalized = rawAlerts.map((raw) => normalizeAlert(raw))
  const malformedIndex = normalized.findIndex((alert) => alert === undefined)
  if (malformedIndex !== -1) {
    return {
      status: "error",
      message: `\`socket ci --json\` reported an alert entry (index ${String(malformedIndex)}) missing a required field (package/version/type).`,
    }
  }

  return { status: "failed", alerts: normalized as NormalizedSocketAlert[] }
}

/**
 * Runs the Socket CLI, then -- only when the CLI actually produced an alert assessment
 * (`passed`/`failed`) -- reconciles `.repo-contract/exceptions/socket.json` against the alerts it
 * found and writes it back. On `unavailable`/`error` the registry is validated but not reconciled
 * (the CLI produced no alert list, so no record can be concluded stale).
 * @param root - Absolute path to the repository being checked.
 * @returns The full `SecuritySocketEvidence` for `output: { format: "json" }`.
 */
export async function runSecuritySocketScan(root: string): Promise<SecuritySocketEvidence> {
  const cli = runSocketCli()
  const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)

  const loaded = await loadExceptionRegistry({ path: registryPath, schema: registrySchema })

  if (cli.status === "unavailable" || cli.status === "error") {
    const base =
      cli.status === "unavailable"
        ? { status: cli.status, reason: cli.reason, registryPath: REGISTRY_RELATIVE_PATH }
        : { status: cli.status, message: cli.message, registryPath: REGISTRY_RELATIVE_PATH }
    return loaded.ok
      ? { ...base, existingRecordCount: loaded.records.length }
      : { ...base, existingRecordCount: 0, registryError: loaded.errors }
  }

  const alerts = cli.status === "failed" ? cli.alerts : []
  const empty = {
    status: cli.status,
    registryPath: REGISTRY_RELATIVE_PATH,
    alerts,
    activeExceptions: {} as Record<string, SocketExceptionRecord>,
    staleExceptions: [] as readonly SocketExceptionRecord[],
    scaffoldedIds: [] as readonly string[],
  }
  if (!loaded.ok) return { ...empty, registryError: loaded.errors }

  const reconciled = reconcileExceptions<NormalizedSocketAlert, SocketExceptionRecord>({
    existing: loaded.records,
    findings: alerts,
    deriveId: (alert) => alert.id,
    createStub: createSocketStub,
  })
  if (!reconciled.ok) return { ...empty, registryError: [reconciled.error] }

  const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

  try {
    await mkdir(path.dirname(registryPath), { recursive: true })
  } catch (error) {
    return {
      ...empty,
      registryError: [`Could not create the exceptions directory: ${(error as Error).message}`],
    }
  }
  const write = await writeExceptionRegistry({
    path: registryPath,
    records: asFlatExceptionRecords([...activeRecords, ...staleRecords]),
  })
  if (!write.ok) return { ...empty, registryError: [`Writing the registry failed: ${write.error}`] }

  const activeExceptions: Record<string, SocketExceptionRecord> = {}
  for (const record of activeRecords) activeExceptions[record.id] = record

  return {
    status: cli.status,
    registryPath: REGISTRY_RELATIVE_PATH,
    alerts,
    activeExceptions,
    staleExceptions: staleRecords,
    scaffoldedIds: newStubIds,
  }
}

// Mirrors scripts/suppression-governance/check.ts's own "only run when invoked directly, not when
// imported by a test" guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runSecuritySocketScan(process.cwd())
  process.stdout.write(JSON.stringify(evidence))
}
