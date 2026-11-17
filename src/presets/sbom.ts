import { normalize } from "node:path"
import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkBoolean, checkOptionsObject, checkPaths, shownValue } from "./rules/option-checks.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * Options for {@link sbom}.
 * @beta
 */
export interface SbomOptions {
  /** The npm lockfile the SBOM is built from. It must have a `packages` map (lockfileVersion 2 or 3). Defaults to `"package-lock.json"`. */
  readonly lockfile?: string
  /** The SBOM of every locked package, dev dependencies included (their `scope` is `"excluded"`). Defaults to `"docs/sbom.cdx.json"`. */
  readonly output?: string
  /** The SBOM of what installing the package brings in: every locked package not marked `dev`. Defaults to `"docs/sbom.production.cdx.json"`; `null` skips it. */
  readonly productionOutput?: string | null
  /** Write the documents instead of checking them. Defaults to `false`: the check fails when a committed document is missing or out of date. Write mode refuses a path that is a symbolic link, is not a regular file, or resolves outside the working directory. It also refuses the lockfile: its path, a hard link to it, or a case-variant name on a case-insensitive file system. A refusal writes nothing and exits 1. */
  readonly write?: boolean
  /** The command a failure message tells the reader to run to regenerate the documents. */
  readonly fix?: string
}

type DocumentStatus = "current" | "stale" | "missing" | "invalid" | "written"

interface DocumentReport {
  readonly file: string
  readonly status: DocumentStatus
  readonly components: number
}

type GeneratorReport =
  | { readonly ok: false; readonly error: string }
  | { readonly ok: true; readonly documents: readonly DocumentReport[] }

/**
 * The generator executed by `node -e`. It is self-contained, so the preset needs no external tool
 * and never calls `npm ls` (whose output npm corrupts on some deprecation notices). It builds a
 * CycloneDX 1.6 document from the lockfile alone, so the output is deterministic. Components and
 * dependency edges are sorted, and there is no timestamp. The serial number is a UUIDv5 of the
 * document's content. Arguments: lockfile, output, production output ("" for none), mode
 * ("check" or "write"). It prints only a JSON report. In write mode it checks every path before
 * writing any, and writes each through a temporary file and a rename. A refused path exits 1.
 */
const GENERATOR_SOURCE = String.raw`
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const [lockfile, output, productionOutput, mode] = process.argv.slice(1)
const NAMESPACE = Buffer.from("8f6c2a4e5b1d4c7a9e3f0d2b6a8c4e1f", "hex")
const HASH_ALGORITHMS = new Map([["sha512", ["SHA-512", 128]], ["sha384", ["SHA-384", 96]], ["sha256", ["SHA-256", 64]], ["sha1", ["SHA-1", 40]]])
const LICENSE_ID = /^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.-]*\+?)$/
const OPERATOR = /^(AND|OR|WITH)$/
const SCHEME = /^[A-Za-z][A-Za-z0-9.-]*:/
function report(value) {
  process.stdout.write(JSON.stringify(value))
}
function readLock() {
  let text
  try {
    text = fs.readFileSync(lockfile, "utf8")
  } catch {
    return "Cannot read the lockfile " + JSON.stringify(lockfile) + "."
  }
  let lock
  try {
    lock = JSON.parse(text)
  } catch {
    return "The lockfile " + JSON.stringify(lockfile) + " is not valid JSON."
  }
  if (typeof lock !== "object" || lock === null || typeof lock.packages !== "object" || lock.packages === null || Array.isArray(lock.packages)) {
    return "The lockfile " + JSON.stringify(lockfile) + " has no packages map: lockfileVersion 2 or 3 is required."
  }
  const broken = Object.keys(lock.packages).find((key) => {
    const entry = lock.packages[key]
    return typeof entry !== "object" || entry === null || Array.isArray(entry)
  })
  if (broken !== undefined) {
    return "The lockfile " + JSON.stringify(lockfile) + " has a packages entry that is not an object: " + JSON.stringify(broken) + "."
  }
  return lock.packages
}
const packages = readLock()
if (typeof packages === "string") {
  report({ ok: false, error: packages })
  process.exit(0)
}
const has = (key) => Object.prototype.hasOwnProperty.call(packages, key)
const root = has("") ? packages[""] : {}
const keys = Object.keys(packages).filter((key) => key !== "").sort()
function nameOf(key, entry) {
  if (typeof entry.name === "string") return entry.name
  const at = key.lastIndexOf("node_modules/")
  return at === -1 ? key : key.slice(at + "node_modules/".length)
}
function target(key) {
  const entry = packages[key]
  return entry.link === true && typeof entry.resolved === "string" ? entry.resolved : key
}
function resolve(from, dependency) {
  let base = from
  for (;;) {
    const candidate = (base === "" ? "" : base + "/") + "node_modules/" + dependency
    if (has(candidate)) return target(candidate)
    if (base === "") return null
    const at = base.lastIndexOf("/node_modules/")
    base = at === -1 ? "" : base.slice(0, at)
  }
}
function hashes(integrity) {
  if (typeof integrity !== "string") return []
  const found = new Map()
  for (const part of integrity.split(/\s+/)) {
    const [name, digest] = part.split("-", 2)
    const known = HASH_ALGORITHMS.get(name)
    if (known === undefined || digest === undefined || found.has(known[0])) continue
    const content = Buffer.from(digest, "base64").toString("hex")
    if (content.length === known[1]) found.set(known[0], content)
  }
  return [...HASH_ALGORITHMS.values()].filter(([alg]) => found.has(alg)).map(([alg]) => ({ alg, content: found.get(alg) }))
}
function licenses(license) {
  if (typeof license !== "string" || license.trim() === "") return []
  const tokens = license.replace(/[()]/g, " ").trim().split(/\s+/)
  const expression = tokens.length % 2 === 1 && tokens.every((token, index) => (index % 2 === 1 ? OPERATOR.test(token) : LICENSE_ID.test(token)))
  return expression && license !== "UNLICENSED" ? [{ expression: license }] : [{ license: { name: license } }]
}
function purl(name, version) {
  const slash = name.startsWith("@") ? name.indexOf("/") : -1
  const namespace = slash === -1 ? "" : encodeURIComponent(name.slice(0, slash)) + "/"
  return "pkg:npm/" + namespace + encodeURIComponent(slash === -1 ? name : name.slice(slash + 1)) + "@" + encodeURIComponent(version)
}
function reference(resolved) {
  if (typeof resolved !== "string") return null
  const url = resolved.startsWith("git+") ? resolved.slice(4) : resolved
  if (!SCHEME.test(url)) return null
  return { type: url === resolved && !resolved.startsWith("git:") ? "distribution" : "vcs", url }
}
function component(ref, entry, type) {
  const name = nameOf(ref, entry)
  const slash = name.startsWith("@") ? name.indexOf("/") : -1
  const result = { type, "bom-ref": ref }
  if (slash !== -1) result.group = name.slice(0, slash)
  result.name = slash === -1 ? name : name.slice(slash + 1)
  if (typeof entry.version === "string") {
    result.version = entry.version
    result.purl = purl(name, entry.version)
  }
  if (ref !== ROOT) result.scope = entry.dev === true ? "excluded" : entry.optional === true || entry.devOptional === true ? "optional" : "required"
  const digests = hashes(entry.integrity)
  if (digests.length > 0) result.hashes = digests
  const declared = licenses(entry.license)
  if (declared.length > 0) result.licenses = declared
  const where = reference(entry.resolved)
  if (where !== null) result.externalReferences = [where]
  return result
}
const ROOT = typeof root.name === "string" ? root.name + (typeof root.version === "string" ? "@" + root.version : "") : "root"
function uuid(content) {
  const name = crypto.createHash("sha256").update(content).digest("hex")
  const bytes = crypto.createHash("sha1").update(Buffer.concat([NAMESPACE, Buffer.from(name)])).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}
function build(production) {
  const included = keys.filter((key) => packages[key].link !== true && !(production && packages[key].dev === true))
  const present = new Set(included)
  const edges = (key, entry) => {
    const fields = ["dependencies", "optionalDependencies", "peerDependencies"]
    if (!production && !key.includes("node_modules/")) fields.push("devDependencies")
    const refs = new Set()
    for (const field of fields) {
      const declared = entry[field]
      if (typeof declared !== "object" || declared === null) continue
      for (const dependency of Object.keys(declared)) {
        const ref = resolve(key, dependency)
        if (ref !== null && present.has(ref)) refs.add(ref)
      }
    }
    return [...refs].sort()
  }
  const body = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      lifecycles: [{ phase: "pre-build" }],
      tools: { components: [{ type: "application", name: "repo-contract sbom preset" }] },
      component: component(ROOT, root, "library"),
    },
    components: included.map((key) => component(key, packages[key], "library")),
    dependencies: [{ ref: ROOT, dependsOn: edges("", root) }, ...included.map((key) => ({ ref: key, dependsOn: edges(key, packages[key]) }))],
  }
  const { bomFormat, specVersion, ...rest } = body
  return { bomFormat, specVersion, serialNumber: "urn:uuid:" + uuid(JSON.stringify(body)), ...rest }
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  if (typeof value === "object" && value !== null) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}"
  }
  return JSON.stringify(value)
}
function comparable(document) {
  const { serialNumber, ...rest } = document
  if (typeof rest.metadata === "object" && rest.metadata !== null) {
    const { timestamp, ...metadata } = rest.metadata
    rest.metadata = metadata
  }
  return canonical(rest)
}
function settle(file, document) {
  const components = document.components.length
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch {
    return { file, status: "missing", components }
  }
  let committed
  try {
    committed = JSON.parse(text)
  } catch {
    return { file, status: "invalid", components }
  }
  if (typeof committed !== "object" || committed === null || Array.isArray(committed)) return { file, status: "invalid", components }
  return { file, status: comparable(committed) === comparable(document) ? "current" : "stale", components }
}
// Write mode refuses any path that resolves outside the working directory, so a symbolic link
// committed to the repository cannot redirect the write onto a file elsewhere. It also refuses
// the lockfile itself. A path is the lockfile when it resolves to the lockfile's path, or when it
// names the same file (device and inode). The second test catches a hard link, and a case-variant
// spelling on a case-insensitive file system.
const PROJECT = fs.realpathSync(".")
const LOCKFILE = fs.realpathSync(lockfile)
const LOCKED = fs.statSync(lockfile)
class Refusal extends Error {}
function refuse(option, file, reason) {
  throw new Refusal("Refused to write " + option + " " + JSON.stringify(file) + ": " + reason)
}
function confine(option, file, resolved) {
  if (!resolved.startsWith(PROJECT + path.sep)) refuse(option, file, "it resolves to " + JSON.stringify(resolved) + ", outside the project.")
}
function place(option, file) {
  const absolute = path.resolve(file)
  let ancestor = path.dirname(absolute)
  const missing = []
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  const directory = path.join(fs.realpathSync(ancestor), ...missing)
  const target = path.join(directory, path.basename(absolute))
  confine(option, file, target)
  if (target === LOCKFILE) refuse(option, file, "it is the lockfile.")
  let found = null
  try {
    found = fs.lstatSync(target)
  } catch {}
  if (found !== null && found.dev === LOCKED.dev && found.ino === LOCKED.ino) refuse(option, file, "it is the lockfile.")
  if (found?.isSymbolicLink()) refuse(option, file, "it is a symbolic link.")
  if (found !== null && !found.isFile()) refuse(option, file, "it is not a regular file.")
  return { option, file, directory, target }
}
function writeAll(wanted) {
  const places = wanted.map(([option, file]) => place(option, file))
  for (const { option, file, directory, target } of places) {
    fs.mkdirSync(directory, { recursive: true })
    // Re-resolved after creation: a directory swapped for a link since place() ran is caught here.
    confine(option, file, path.join(fs.realpathSync(directory), path.basename(target)))
  }
  return places.map(({ file, directory, target }, index) => {
    const document = build(wanted[index][2])
    // A rename replaces a link or hard link at the target instead of writing through it.
    const temporary = path.join(directory, "." + path.basename(target) + "." + crypto.randomBytes(8).toString("hex") + ".tmp")
    fs.writeFileSync(temporary, JSON.stringify(document, null, 2) + "\n", { flag: "wx" })
    fs.renameSync(temporary, target)
    return { file, status: "written", components: document.components.length }
  })
}
const wanted = [["output", output, false]]
if (productionOutput !== "") wanted.push(["productionOutput", productionOutput, true])
try {
  report({ ok: true, documents: mode === "write" ? writeAll(wanted) : wanted.map(([, file, production]) => settle(file, build(production))) })
} catch (error) {
  if (!(error instanceof Refusal)) throw error
  report({ ok: false, error: error.message })
  process.exitCode = 1
}
`

const STATUSES: ReadonlySet<unknown> = new Set([
  "current",
  "stale",
  "missing",
  "invalid",
  "written",
])

/**
 * Whether `value` has the shape the generator prints.
 * @param value - the parsed generator output.
 * @returns `true` when it is a well-formed report.
 */
function isReport(value: unknown): value is GeneratorReport {
  // A primitive reads as having no fields, so only null and undefined need replacing.
  const report = (value ?? {}) as { ok?: unknown; error?: unknown; documents?: unknown }
  if (report.ok === false) return typeof report.error === "string"
  return (
    report.ok === true &&
    Array.isArray(report.documents) &&
    report.documents.every(
      (document: Partial<Record<keyof DocumentReport, unknown>> | null) =>
        document !== null &&
        typeof document.file === "string" &&
        STATUSES.has(document.status) &&
        typeof document.components === "number",
    )
  )
}

/**
 * Summarizes one document for a rationale.
 * @param document - one entry of the generator's report.
 * @returns e.g. `docs/sbom.cdx.json: stale (12 components)`.
 */
function summarize(document: DocumentReport): string {
  return `${document.file}: ${document.status} (${String(document.components)} components)`
}

/**
 * Refuses an output path spelled as the lockfile's path, so the mistake fails when the config
 * loads. Spellings are compared after normalizing. The generator refuses the rest in write mode: a
 * symbolic link, a hard link, or a case-variant name that reaches the lockfile.
 * @param lockfile - the `lockfile` option.
 * @param outputs - the `output` and `productionOutput` options; `null` skips that document.
 * @throws {RangeError} naming the first output that is the lockfile.
 */
function checkNotLockfile(
  lockfile: string,
  outputs: Readonly<Record<string, string | null>>,
): void {
  for (const [option, file] of Object.entries(outputs)) {
    if (file !== null && normalize(file) === normalize(lockfile)) {
      throw new RangeError(
        `sbom: ${option} must name a file other than the lockfile, got ${shownValue(file)}.`,
      )
    }
  }
}

/**
 * Keeps a CycloneDX 1.6 SBOM of the package's locked dependencies current. It builds the document
 * from the npm lockfile with no external tool, deterministically: the same lockfile always gives
 * the same document. By default it writes nothing. It fails when a committed document is missing
 * or differs from what the lockfile gives. The comparison ignores only `serialNumber` and
 * `metadata.timestamp`. So a document another tool regenerated, or a reformatted one, still counts
 * as current when its content matches. With `write: true` it writes the documents instead, for a
 * regenerate command.
 *
 * The documents list every package in the lockfile's `packages` map. Each carries its purl, the
 * hashes from `integrity`, the declared license and the resolved URL. The full dependency graph
 * follows. The production document leaves out packages marked `dev`. It describes what the
 * lockfile pins, not what is installed in `node_modules`.
 * @param options - configuration for this check; see {@link SbomOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `lockfile`, `output` or `productionOutput` is not a non-empty path,
 * when `output` or `productionOutput` is spelled as the lockfile's path, or when `write` is not a
 * boolean.
 * @beta
 */
export function sbom(options: SbomOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("sbom", options)
  const {
    lockfile = "package-lock.json",
    output = "docs/sbom.cdx.json",
    productionOutput = "docs/sbom.production.cdx.json",
    write = false,
    fix,
  } = options
  checkPaths("sbom", {
    lockfile,
    output,
    ...(productionOutput === null ? {} : { productionOutput }),
  })
  checkBoolean("sbom", "write", write)
  checkNotLockfile(lockfile, { output, productionOutput })

  return {
    run: [
      "node",
      "-e",
      GENERATOR_SOURCE,
      lockfile,
      output,
      productionOutput ?? "",
      write ? "write" : "check",
    ],
    output: { format: "json" },
    policy: ({ result }): PolicyResult => {
      const terminated = checkTerminatedAbnormally(result, "The SBOM generator")
      if (terminated) return terminated
      if (!result.output?.success) {
        return {
          outcome: "fail",
          rationale: "The SBOM generator output could not be parsed as JSON.",
        }
      }
      const value: unknown = result.output.value
      if (!isReport(value)) {
        return {
          outcome: "fail",
          rationale: "The SBOM generator produced invalid JSON report data.",
        }
      }
      if (!value.ok) return { outcome: "fail", rationale: value.error }

      const listed = value.documents.map((document) => `- ${summarize(document)}`)
      if (write) {
        return {
          outcome: "pass",
          rationale: [`Wrote CycloneDX 1.6 SBOM(s) from ${lockfile}:`, ...listed].join("\n"),
        }
      }
      if (value.documents.every((document) => document.status === "current")) {
        return {
          outcome: "pass",
          rationale: [`CycloneDX 1.6 SBOM(s) match ${lockfile}:`, ...listed].join("\n"),
        }
      }
      return {
        outcome: "fail",
        rationale: [
          `SBOM(s) out of date with ${lockfile}:`,
          ...listed,
          fix === undefined
            ? "Regenerate them with this preset in write mode (sbom({ write: true }))."
            : `Regenerate them: ${fix}`,
        ].join("\n"),
      }
    },
  }
}
