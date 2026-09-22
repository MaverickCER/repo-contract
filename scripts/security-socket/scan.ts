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
import { mkdir, readFile } from "node:fs/promises"
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

/**
 * `NormalizedSocketAlert` minus `shipped` -- what `normalizeAlert`/`runSocketCli` can determine
 * from the CLI's own report alone. `shipped` needs package-lock.json (`loadShippedPackageVersions`,
 * an async read), so it's attached afterward in `runSecuritySocketScan`, the one place that already
 * has `root` and is already `async`; keeping `normalizeAlert`/`runSocketCli` synchronous and
 * filesystem-free preserves their existing, purely-CLI-output-driven unit-test surface.
 */
type RawNormalizedAlert = Omit<NormalizedSocketAlert, "shipped">

/** The raw result of running the Socket CLI, before any registry reconciliation. */
type SocketCliResult =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly alerts: readonly RawNormalizedAlert[] }
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
 * conservative: an entry missing any of `package`/`version`/`type`/`category` is rejected outright
 * (the caller treats any rejection as `status: "error"` for the whole report -- see this module's
 * own doc comment on why the authenticated-alert shape is unverified in this environment and this
 * parsing path stays maximally defensive). `category` is validated the same way as the other three:
 * `NormalizedSocketAlert.category`'s own doc comment records that a real alert always carries one
 * (confirmed against `@socketsecurity/cli`'s own `vendor.js`), so an entry without one is exactly as
 * suspect as one missing its `type`.
 * @param raw - One candidate alert entry from the parsed report.
 * @returns The normalized alert, or `undefined` if `raw` doesn't match the minimum recognized shape.
 */
function normalizeAlert(raw: unknown): RawNormalizedAlert | undefined {
  if (!isPlainObject(raw)) return undefined

  const packageName = raw.package ?? raw.name
  const { version, type, category } = raw
  const severityRaw = raw.severity

  if (typeof packageName !== "string" || packageName.length === 0) return undefined
  if (typeof version !== "string" || version.length === 0) return undefined
  if (typeof type !== "string" || type.length === 0) return undefined
  if (typeof category !== "string" || category.length === 0) return undefined

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
    category,
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

  // `ok: true` -- the scan completed. Confirmed directly against a real authenticated org
  // (2026-09-16): `alerts` is never an array -- it's the CLI's own `mapToObject()` serialization
  // of an internal, possibly multi-level nested `Map` (`walkNestedMap()` in
  // @socketsecurity/cli's own utils.js). A genuinely clean scan reports `"alerts": {}` (an empty
  // object, `healthy: true`), which is unambiguous: zero keys is zero alerts, regardless of the
  // nested shape a *populated* result would have. That populated shape uses its own
  // policy/type/manifest/url vocabulary (keyed by `[policyKey, package, introducedBy]` per
  // `walkNestedMap`'s own output -- see `toMarkdownReport()` in the CLI's cli.js), not the
  // `severity: critical|high|middle|low` shape `normalizeAlert` below expects -- guessing at that
  // mapping without a real populated example to verify against risks silently misclassifying a
  // genuine critical alert, worse than failing loudly. So: an empty object is trusted; anything
  // else (a non-empty object, or any other non-array shape) fails closed with a message pointing
  // at the real gap.
  const rawAlerts =
    (isPlainObject(parsed.data) ? parsed.data.alerts : undefined) ?? parsed.alerts ?? []

  if (isPlainObject(rawAlerts) && Object.keys(rawAlerts).length === 0) {
    return { status: "passed" }
  }

  if (!Array.isArray(rawAlerts)) {
    return {
      status: "error",
      message:
        "`socket ci --json` reported one or more alerts, in the CLI's real nested-object shape this check does not yet parse (only the always-empty \"{}\" case is handled -- see this function's own comment). Run `socket ci --json` directly to see the raw alerts and update this parser against real data before trusting this result.",
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
      message: `\`socket ci --json\` reported an alert entry (index ${String(malformedIndex)}) missing a required field (package/version/type/category).`,
    }
  }

  return { status: "failed", alerts: normalized as RawNormalizedAlert[] }
}

/**
 * Reads package-lock.json's own per-resolved-path `dev`/`peer`/`optional`/`devOptional` flags
 * (npm lockfile v2/v3's own dependency-type bookkeeping -- see `npm help package-lock.json`'s own
 * "dev, optional, devOptional" section) to determine which `name@version` pairs are reachable via
 * at least one real production edge -- i.e. actually installed for a consumer of THIS package
 * (`dependencies`, transitively, optional or not) -- as opposed to reachable only through
 * `devDependencies` (this repo's own build/test tooling, never shipped) or `peerDependencies`
 * (supplied by the CONSUMER's own project, never bundled by this one). Only `dev`/`peer` exclude a
 * path: `optional` alone (`optionalDependencies`, direct or transitive) is still a real production
 * edge -- npm attempts to install it for every consumer, it's merely allowed to fail -- and
 * `devOptional` (per npm's own docs: set only when a package is BOTH a dev dependency AND an
 * optional dependency of a *non-dev* dependency) proves a genuine non-dev path reaches it too, via
 * that optional edge. Confirmed directly against a real lockfile with genuine `devDependencies`
 * (this repository's own `@esbuild/*` platform binaries, reachable only through the `tsup`
 * devDependency's own `optionalDependencies`): npm correctly cascades `dev: true` alongside
 * `optional: true` there, so excluding only `dev`/`peer` does not let a genuinely dev-only optional
 * package through as a false "shipped" positive. The same resolved `name@version` can appear at
 * multiple lockfile paths with different flags when required by both a production and a
 * dev-only/peer-only parent -- it's counted "shipped" if ANY path reaches it without `dev`/`peer`,
 * since that path alone proves it really is installed for a consumer. An npm workspace/`file:`-link
 * entry (`{ link: true, resolved }`) is resolved to its target entry for its own `version`/`dev`/
 * `peer` rather than treated as a parse failure -- see this function's own `pendingLinks` comment.
 *
 * Returns `undefined` if package-lock.json can't be read or doesn't have the expected shape --
 * `runSecuritySocketScan` fails closed on this (treats every alert as `shipped: true`) rather than
 * silently under-scoping the zero-tolerance `supplyChainRisk` policy this feeds (see
 * `checks/security-socket.ts`'s `"socket-category"` classification): a broken/missing lockfile
 * read must never be the reason a real supply-chain-risk alert on a genuinely shipped dependency
 * goes unenforced.
 * Exported for direct unit coverage -- not part of this script's own CLI/stdout contract.
 * @param root - Absolute path to the repository being checked.
 * @returns The set of `"<name>@<version>"` pairs reachable via a real production edge, or `undefined`.
 * @internal
 */
export async function loadShippedPackageVersions(root: string): Promise<Set<string> | undefined> {
  let raw: string
  try {
    raw = await readFile(path.join(root, "package-lock.json"), "utf8")
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.packages)) return undefined

  const packages = parsed.packages
  const shipped = new Set<string>()
  // npm workspaces / `file:`-linked local packages get a `node_modules/<name>` entry with only
  // `{ link: true, resolved: "<target key>" }` -- confirmed directly against a real `npm install
  // --package-lock-only` on a minimal workspace -- never a `version`/`dev`/`peer` of its own ("no
  // other fields are specified", per `npm help package-lock.json`'s own "link" bullet); the real
  // version and dev/peer/optional bookkeeping lives on the SEPARATE entry `resolved` points at
  // (e.g. `"packages/foo"`, itself a key into this same `packages` object, not under
  // `node_modules/`). Resolving links is deferred to a second pass so the first pass's `name` can
  // still come from the link's own `node_modules/<name>` key (the target entry's own key is a
  // workspace-relative path, not a package name).
  const pendingLinks: { readonly name: string; readonly resolved: string }[] = []

  for (const [key, value] of Object.entries(packages)) {
    // The root package's own entry (key `""`) describes this repository itself, not a dependency;
    // any other key without a `node_modules/` segment is some other top-level lockfile field, not
    // a dependency entry either -- both are skipped, never treated as a parse failure.
    if (key === "") continue
    const nodeModulesMarker = "node_modules/"
    const markerIndex = key.lastIndexOf(nodeModulesMarker)
    if (markerIndex === -1) continue
    // A genuine dependency-path entry whose value isn't even a plain object is a lockfile this
    // function cannot trust at all -- fail closed (return undefined) rather than silently `continue`
    // past it, which would otherwise leave this exact package missing from `shipped` and let a real
    // supply-chain-risk alert on it go unenforced (see this function's own "fails closed" doc
    // comment above).
    if (!isPlainObject(value)) return undefined
    const name = key.slice(markerIndex + nodeModulesMarker.length)
    // dev/peer-only entries are excluded regardless of their `version`/`link`/`resolved` fields'
    // validity -- they were never going to be counted as shipped, so a malformed descriptor on one
    // of them is not a reason to distrust the whole lockfile. Checked defensively even on a `link`
    // entry, since npm's own docs promise it carries no other fields today, not that a future
    // lockfile version never will.
    if (value.dev === true || value.peer === true) continue
    if (value.link === true) {
      if (typeof value.resolved !== "string" || value.resolved.length === 0) return undefined
      pendingLinks.push({ name, resolved: value.resolved })
      continue
    }
    const version = value.version
    if (typeof version !== "string" || version.length === 0) return undefined
    shipped.add(`${name}@${version}`)
  }

  for (const { name, resolved } of pendingLinks) {
    const target = packages[resolved]
    // An unresolvable or malformed link target is exactly the "genuinely invalid descriptor" case
    // that still fails closed -- retaining the same distrust-the-whole-lockfile posture as every
    // other malformed entry above, not silently treating an unresolvable link as unshipped.
    if (!isPlainObject(target)) return undefined
    if (target.dev === true || target.peer === true) continue
    const version = target.version
    if (typeof version !== "string" || version.length === 0) return undefined
    shipped.add(`${name}@${version}`)
  }

  return shipped
}

/**
 * Runs the Socket CLI, then -- only when the CLI actually produced an alert assessment
 * (`passed`/`failed`) -- reconciles `.repo-contract/exceptions/socket.json` against the alerts it
 * found and writes it back. On `unavailable`/`error` the registry is validated but not reconciled
 * (the CLI produced no alert list, so no record can be concluded stale). A `"failed"` CLI result
 * whose `shipped` status can't be determined (`loadShippedPackageVersions` returned `undefined`)
 * becomes `status: "error"` instead -- see that early return's own comment for why this fails
 * closed with an explicit reason rather than guessing.
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

  let alerts: readonly NormalizedSocketAlert[] = []
  if (cli.status === "failed") {
    const shippedVersions = await loadShippedPackageVersions(root)
    if (shippedVersions === undefined) {
      // Fail the whole scan closed rather than silently guessing `shipped: true` for every alert:
      // a guess (even the maximally-strict direction) can produce a misleading "supply-chain-risk
      // alerts are never waivable" verdict on a genuinely peer-only/dev-only package, sending
      // whoever's debugging it chasing the wrong thing instead of the real problem (an unreadable
      // or malformed package-lock.json). An explicit `status: "error"` still fails the check just
      // as strictly, but with an accurate reason.
      const message =
        "package-lock.json could not be read or parsed -- refusing to guess whether alerted " +
        "dependencies are actually shipped for the zero-tolerance supplyChainRisk policy."
      return loaded.ok
        ? {
            status: "error",
            message,
            registryPath: REGISTRY_RELATIVE_PATH,
            existingRecordCount: loaded.records.length,
          }
        : {
            status: "error",
            message,
            registryPath: REGISTRY_RELATIVE_PATH,
            existingRecordCount: 0,
            registryError: loaded.errors,
          }
    }
    alerts = cli.alerts.map((a) => ({
      ...a,
      shipped: shippedVersions.has(`${a.package}@${a.version}`),
    }))
  }
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
