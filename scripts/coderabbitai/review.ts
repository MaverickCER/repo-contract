// Entry point for the "coderabbitai" self-hosting check, invoked via
// `run: ["tsx", "scripts/coderabbitai/review.ts"]` in repo-contract.config.ts. Prints ONLY the JSON
// evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/security-socket/scan.ts's own stdout contract.
//
// Self-hosting tooling, not published `src/`: this script *may* read the ambient environment
// (`process.env.CI`) and spawn a git subprocess for its own pre-flight check, the same latitude
// scripts/install-hooks.mjs already takes -- see specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
//
// Report-only: this script's own exit code is never the pass/fail signal
// (checks/coderabbitai.ts's policy, reading this same evidence, is) -- it always exits 0 once it
// has produced *some* well-formed evidence, including `status: "not-applicable"`/`"unavailable"`/
// `"error"`.

import { sync as spawnSync } from "cross-spawn"
import { pathToFileURL } from "node:url"
import type { CoderabbitEvidence, NormalizedFinding } from "./evidence-types.js"

const SEVERITY_VALUES = new Set(["critical", "major", "minor"])

/**
 * Whether the current git checkout is on a detached `HEAD` -- `coderabbit review`'s own base-
 * branch comparison needs a real branch to diff from/to, and a detached checkout (a CI runner mid-
 * rebase, a tag checkout, a bisect) is a genuine "can't establish git context" condition this
 * wrapper recognizes itself, up front, rather than trying to parse it back out of whatever error
 * text a future CLI version happens to print for the same underlying problem.
 * @returns `true` if `HEAD` is detached (not on a named branch).
 */
function isDetachedHead(): boolean {
  const result = spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { encoding: "utf8" })
  // A real spawn failure (git itself missing) is not this function's concern -- `coderabbit`
  // itself would fail identically and far more informatively; only a *successful* git invocation
  // that reports "no symbolic ref" (a non-zero exit with no spawn error) means detached HEAD.
  return !result.error && result.status !== 0
}

/**
 * Whether `value` is a non-null, non-array object -- duplicated from
 * `scripts/security-socket/scan.ts`'s own identical helper rather than imported, for the same
 * reason that file's own doc comment gives (self-hosting scripts stay independent of each other).
 * @param value - The candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Normalizes one real `{"type":"finding", ...}` event -- confirmed shape (see evidence-types.ts's
 * own doc comment): `severity`, `fileName`, `codegenInstructions`. Rejects an entry missing
 * `fileName`/`codegenInstructions` outright (the caller treats any rejection as `status: "error"`
 * for the whole stream).
 * @param raw - One candidate finding event, already known to have `type === "finding"`.
 * @returns The normalized finding, or `undefined` if `raw` doesn't match the minimum recognized shape.
 */
function normalizeFinding(raw: Record<string, unknown>): NormalizedFinding | undefined {
  const { fileName, codegenInstructions, severity: severityRaw } = raw
  if (typeof fileName !== "string" || fileName.length === 0) return undefined
  if (typeof codegenInstructions !== "string" || codegenInstructions.length === 0) return undefined

  const severity =
    typeof severityRaw === "string" && SEVERITY_VALUES.has(severityRaw.toLowerCase())
      ? (severityRaw.toLowerCase() as "critical" | "major" | "minor")
      : "unknown"

  return {
    file: fileName,
    severity,
    summary: codegenInstructions,
    // Deliberately coarse -- see NormalizedFinding's own doc comment on why file+severity, not a
    // hash of the AI-generated summary text, is this check's registry-matching identity.
    identity: `${fileName}:${severity}`,
  }
}

/**
 * Parses `coderabbit review --agent`'s newline-delimited JSON event stream. Unrecognized event
 * `type`s are silently skipped -- the stream protocol is inherently extensible (progress/status
 * events already vary run to run) and a future CLI version adding a new informational event type
 * must not break this check. A `finding` event that doesn't match the minimum recognized shape,
 * or a line that isn't parseable JSON at all, is NOT silently skipped -- either fails the whole
 * parse closed, exactly like `checks/mutation.ts` does for a malformed Stryker report.
 * @param stdout - The CLI's raw captured stdout.
 * @returns The findings observed and whether a terminal `complete` event was seen, or the error message if parsing failed closed.
 */
function parseAgentStream(stdout: string):
  | {
      readonly ok: true
      readonly findings: readonly NormalizedFinding[]
      readonly completed: boolean
    }
  | { readonly ok: false; readonly error: string } {
  const findings: NormalizedFinding[] = []
  let completed = false

  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return { ok: false, error: `coderabbit review --agent produced a non-JSON line: ${line}` }
    }

    if (!isPlainObject(parsed) || typeof parsed.type !== "string") {
      return {
        ok: false,
        error: 'coderabbit review --agent produced an event with no recognized "type" field.',
      }
    }

    if (parsed.type === "finding") {
      const finding = normalizeFinding(parsed)
      if (finding === undefined) {
        return {
          ok: false,
          error:
            'coderabbit review --agent produced a "finding" event missing a required field (fileName/codegenInstructions).',
        }
      }
      findings.push(finding)
      continue
    }

    if (parsed.type === "complete") {
      completed = true
      continue
    }

    // "review_context"/"status"/"heartbeat"/anything else this wrapper doesn't need to interpret
    // -- see this function's own doc comment on why these are ignored, not rejected.
  }

  return { ok: true, findings, completed }
}

/**
 * Runs `coderabbit review --agent` and normalizes its result. Never throws -- every recognized or
 * unrecognized outcome becomes a well-formed `CoderabbitEvidence` value instead.
 * @returns This run's normalized evidence.
 */
export function runCoderabbitReview(): CoderabbitEvidence {
  // Self-hosting tooling outside src/, not published library code (see package.json's "files");
  // reading CI is exactly this repository's own consumer responsibility here, mirroring
  // scripts/install-hooks.mjs's identical justification. n/no-process-env is scoped to src/ only
  // (see eslint.config.js), so no suppression is needed here the way repo-contract.config.ts's
  // own top-level self-hosting config needs one.
  if (process.env.CI) {
    return { status: "not-applicable", reason: "ci", expectedProvider: "coderabbit-github-app" }
  }

  if (isDetachedHead()) {
    return { status: "unavailable", reason: "git-context-unavailable" }
  }

  const result = spawnSync("coderabbit", ["review", "--agent", "--uncommitted"], {
    encoding: "utf8",
  })

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return { status: "unavailable", reason: "cli-not-installed" }
    }
    return {
      status: "error",
      message: `Failed to spawn the \`coderabbit\` CLI: ${nodeError.message}`,
    }
  }

  const parsed = parseAgentStream(result.stdout)
  if (!parsed.ok) {
    return { status: "error", message: parsed.error }
  }

  if (!parsed.completed) {
    const stderrDetail = result.stderr.trim()
    return {
      status: "error",
      message:
        stderrDetail.length > 0
          ? `coderabbit review --agent ended without a "complete" event (exit code ${String(result.status)}): ${stderrDetail}`
          : `coderabbit review --agent ended without a "complete" event (exit code ${String(result.status)}).`,
    }
  }

  return { status: "reviewed", findings: parsed.findings }
}

// Mirrors scripts/security-socket/scan.ts's own "only run when invoked directly, not when
// imported by a test" guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(runCoderabbitReview()))
}
