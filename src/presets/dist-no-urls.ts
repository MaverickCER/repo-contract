import { globMatch } from "../helpers/glob-match.js"
import type { CheckDefinitionConfig } from "../types.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** One allowlisted URL (glob) and the reviewable reason it may ship. */
export interface DistNoUrlsAllowEntry {
  /** A URL, or a glob (`*`, `**`, `?`, `[...]`, `{a,b}`; escape literals with `\`) matched against each whole URL found. */
  readonly url: string
  /** Why this URL must ship in the build output. Required and non-empty -- an allowlist entry without one fails the check. */
  readonly reason: string
}

/** Options accepted by {@link distNoUrls}. */
export interface DistNoUrlsOptions {
  /** Build-output directory to scan, relative to the working directory. Defaults to `"dist"`. */
  readonly dir?: string
  /** URLs permitted in the output, each with a reason. Empty by default: the strictest policy is the default. */
  readonly allow?: readonly DistNoUrlsAllowEntry[]
}

interface UrlFinding {
  readonly file: string
  readonly line: number
  readonly url: string
}

interface UrlScanReport {
  readonly dirExists: boolean
  readonly filesScanned: number
  readonly findings: readonly UrlFinding[]
}

/**
 * The scanner executed by `node -e`. Self-contained on purpose: the preset needs no external tool,
 * and the scan reads every file under the directory (code, declarations, sourcemaps, JSON) so a URL
 * cannot hide in any shipped file. Prints only the JSON report -- never file contents.
 */
const SCANNER_SOURCE = `
const fs = require("node:fs")
const path = require("node:path")
const root = process.argv[1]
const URL_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s"'\`<>)\\]\\\\}]*/g
const findings = []
let filesScanned = 0
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.isFile()) scan(full)
  }
}
function scan(file) {
  filesScanned += 1
  const lines = fs.readFileSync(file, "utf8").split("\\n")
  lines.forEach((text, index) => {
    for (const match of text.matchAll(URL_PATTERN)) {
      findings.push({ file: path.relative(root, file).split(path.sep).join("/"), line: index + 1, url: match[0] })
    }
  })
}
const dirExists = fs.existsSync(root) && fs.statSync(root).isDirectory()
if (dirExists) walk(root)
process.stdout.write(JSON.stringify({ dirExists, filesScanned, findings }))
`

const MAX_LISTED = 20

/**
 * Validates the allowlist's own shape.
 * @param allow - the configured allowlist entries.
 * @returns one message per malformed entry; empty when every entry has a url and a reason.
 */
function allowlistProblems(allow: readonly DistNoUrlsAllowEntry[]): readonly string[] {
  return allow.flatMap((entry, index) => {
    const at = `allow[${String(index)}]`
    const entryProblems: string[] = []
    if (typeof entry.url !== "string" || entry.url.trim() === "") {
      entryProblems.push(`${at}.url must be a non-empty string.`)
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      entryProblems.push(
        `${at}.reason must explain why ${JSON.stringify(entry.url)} has to ship in the build output.`,
      )
    }
    return entryProblems
  })
}

/**
 * Whether `value` has the shape the scanner prints.
 * @param value - the parsed scanner output.
 * @returns `true` when it is a well-formed scan report.
 */
function isReport(value: unknown): value is UrlScanReport {
  if (typeof value !== "object" || value === null) return false
  const report = value as Partial<UrlScanReport>
  return (
    typeof report.dirExists === "boolean" &&
    typeof report.filesScanned === "number" &&
    Array.isArray(report.findings)
  )
}

/**
 * Fails when any URL (any scheme followed by a colon and two slashes) appears in any file of the build output directory, so
 * supply-chain scanners that flag shipped URLs (Socket.dev's "URL strings" alert, for one) have
 * nothing to flag. Scans every file, sourcemaps and declaration files included. Individual URLs can
 * be allowed with a mandatory, reviewable `reason`; there is no blanket opt-out.
 * @param options - configuration for this check; see {@link DistNoUrlsOptions}.
 * @returns the configured check.
 * @beta
 */
export function distNoUrls(options: DistNoUrlsOptions = {}): CheckDefinitionConfig {
  const { dir = "dist", allow = [] } = options

  return {
    run: ["node", "-e", SCANNER_SOURCE, dir],
    output: { format: "json" },
    policy: ({ result }) => {
      const terminated = checkTerminatedAbnormally(result, "The dist URL scan")
      if (terminated) return terminated

      const problems = allowlistProblems(allow)
      if (problems.length > 0) {
        return {
          outcome: "fail",
          rationale: `distNoUrls is misconfigured:\n${problems.map((p) => `- ${p}`).join("\n")}`,
        }
      }

      if (!result.output?.success) {
        return {
          outcome: "fail",
          rationale: "The dist URL scan output could not be parsed as JSON.",
        }
      }
      const value: unknown = result.output.value
      if (!isReport(value)) {
        return {
          outcome: "fail",
          rationale: "The dist URL scan produced invalid JSON report data.",
        }
      }
      if (!value.dirExists) {
        return {
          outcome: "fail",
          rationale: `Build output directory "${dir}" does not exist -- build before running this check.`,
        }
      }

      const offenders = value.findings.filter(
        (finding) => !allow.some((entry) => globMatch(finding.url, entry.url)),
      )
      if (offenders.length === 0) {
        return {
          outcome: "pass",
          rationale: `No non-allowlisted URLs in ${String(value.filesScanned)} file(s) under "${dir}".`,
        }
      }

      const listed = offenders
        .slice(0, MAX_LISTED)
        .map((finding) => `- ${finding.file}:${String(finding.line)} ${finding.url}`)
      const more =
        offenders.length > MAX_LISTED
          ? [`- ...and ${String(offenders.length - MAX_LISTED)} more`]
          : []
      return {
        outcome: "fail",
        rationale: [
          `${String(offenders.length)} URL(s) found in the build output "${dir}" (scanners flag shipped URLs). Remove them from the source (comments, JSDoc, string literals, sourcemap content), or allowlist a specific URL with a reason:`,
          ...listed,
          ...more,
        ].join("\n"),
      }
    },
  }
}
