import { sync as spawnSync } from "cross-spawn"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { GhApiResult } from "./types.js"

/**
 * The `owner/repo` slug, parsed from this repository's own `package.json`
 * `repository.url` -- never hardcoded, so a fork or rename doesn't leave a
 * silently-wrong slug behind.
 * @param root - Repository root to read `package.json` from.
 * @returns The `owner/repo` slug.
 * @throws {Error} If `package.json`'s `repository.url` isn't a parseable GitHub URL.
 */
export function repoSlug(root: string): string {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    repository?: { url?: string }
  }
  const url = pkg.repository?.url ?? ""
  const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(url)
  if (!match)
    throw new Error(`package.json's repository.url is not a parseable GitHub URL: "${url}"`)
  return `${match[1]}/${match[2]}`
}

/**
 * This repository's own `package.json` version -- repo-contract's own
 * evaluator version, and specifically NEVER the upstream `scorecard`
 * binary's version, since this evaluation never runs that binary at all
 * (see this directory's own module doc comments / README for that
 * disclaimer). Read the same way `repoSlug` reads `package.json`, above --
 * but unlike `repoSlug` (which deliberately throws: a check's own `run`
 * entrypoint failing to resolve its own repo slug at all is a real
 * operational problem worth surfacing loudly), this is read for
 * provenance metadata alone, deep inside `checks/openssf-scorecard.ts`'s
 * `policy`, well after evidence-gathering has already succeeded -- a
 * missing/malformed `package.json` at that point must degrade this one
 * cosmetic field to `"unknown"`, never abort a check whose own PASS/FAIL is
 * about evidence-gathering succeeding, not about this metadata (see that
 * file's own module doc comment).
 * @param root - Repository root to read `package.json` from.
 * @returns The version string, or `"unknown"` if `package.json` is missing, unparseable, or carries no `version` field.
 */
export function packageVersion(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      version?: string
    }
    return pkg.version ?? "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Runs `gh api <args>`, classifying "gh isn't installed/authenticated" the
 * same way for every caller. Shared by `ghApiJson` (parses the stdout as
 * JSON) and `ghApiRaw` (returns stdout verbatim, e.g. for a raw-content
 * fetch via the `Accept: application/vnd.github.raw` header) so that
 * classification logic -- and its own test coverage -- lives in exactly one
 * place rather than being duplicated per shape.
 * @param args - Arguments to pass to `gh api` (the REST path, plus any extra flags like `-H`).
 * @returns `gh api`'s raw stdout, or a classified failure.
 */
function spawnGhApi(args: readonly string[]): GhApiResult<string> {
  const probe = spawnSync("gh", ["--version"], { encoding: "utf8", timeout: 30_000 })
  if (probe.error) {
    const code = (probe.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return { ok: false, reason: "unavailable", message: "gh CLI is not installed." }
    }
  }

  const result = spawnSync("gh", ["api", ...args], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  })

  if (result.error) {
    return { ok: false, reason: "error", message: result.error.message }
  }
  if (result.status !== 0) {
    // `gh api` on a non-2xx response still writes the API's own JSON error
    // body to stdout (confirmed directly: a 404 prints
    // `{"message":"...","status":"404"}` to stdout and `gh: ... (HTTP 404)`
    // to stderr) -- read the structured `status` field rather than parsing
    // stderr's human-readable text.
    let apiStatus: string | undefined
    let apiMessage: string | undefined
    try {
      const body = JSON.parse(result.stdout) as { message?: string; status?: string }
      apiStatus = body.status
      apiMessage = body.message
    } catch {
      // stdout wasn't JSON (e.g. gh itself failed before making the request) --
      // fall through to stderr below.
    }
    const message = apiMessage ?? (result.stderr.trim() || result.stdout.trim())
    if (apiStatus === "401" || /not logged in|authentication/i.test(message)) {
      return {
        ok: false,
        reason: "unavailable",
        message: `gh CLI is not authenticated: ${message}`,
      }
    }
    if (apiStatus === "404") {
      return { ok: false, reason: "not-found", message }
    }
    return { ok: false, reason: "error", message }
  }

  return { ok: true, value: result.stdout }
}

/**
 * Calls `gh api <path>` and parses its JSON stdout. Every gh-API-backed
 * check in this directory routes through this one function so "gh isn't
 * installed/authenticated" is handled identically everywhere -- see
 * `GhApiResult`'s own doc comment for why that's `"unavailable"`, never a
 * failure.
 * @param apiPath - The REST path to pass to `gh api`, e.g. `"repos/x/y"`.
 * @returns The parsed JSON body, or a classified failure.
 */
export function ghApiJson<T>(apiPath: string): GhApiResult<T> {
  const raw = spawnGhApi([apiPath])
  if (!raw.ok) return raw

  try {
    return { ok: true, value: JSON.parse(raw.value) as T }
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: `gh api ${apiPath} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Calls `gh api <path>` requesting the GitHub Contents API's raw media type
 * (`Accept: application/vnd.github.raw`), returning the file's real text
 * content directly rather than the default base64-in-JSON envelope -- used
 * to fetch a file straight out of another repository (e.g.
 * `weights.ts` fetching `ossf/scorecard`'s own `checks.yaml` /
 * `scorecard_result.go` at execution time) without a base64-decode step.
 * Shares `ghApiJson`'s exact same "gh unavailable/unauthenticated/not-found"
 * classification via `spawnGhApi`, so a caller handles this failure
 * identically to every other gh-API-backed check in this directory.
 * @param apiPath - The REST path to pass to `gh api`, e.g. `"repos/x/y/contents/path/to/file"`.
 * @returns The file's raw text content, or a classified failure.
 */
export function ghApiRaw(apiPath: string): GhApiResult<string> {
  return spawnGhApi([apiPath, "-H", "Accept: application/vnd.github.raw"])
}
