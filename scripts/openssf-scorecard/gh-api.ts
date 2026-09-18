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
 * Calls `gh api <path>` and parses its JSON stdout. Every gh-API-backed
 * check in this directory routes through this one function so "gh isn't
 * installed/authenticated" is handled identically everywhere -- see
 * `GhApiResult`'s own doc comment for why that's `"unavailable"`, never a
 * failure.
 * @param apiPath - The REST path to pass to `gh api`, e.g. `"repos/x/y"`.
 * @returns The parsed JSON body, or a classified failure.
 */
export function ghApiJson<T>(apiPath: string): GhApiResult<T> {
  const probe = spawnSync("gh", ["--version"], { encoding: "utf8", timeout: 30_000 })
  if (probe.error) {
    const code = (probe.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return { ok: false, reason: "unavailable", message: "gh CLI is not installed." }
    }
  }

  const result = spawnSync("gh", ["api", apiPath], {
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

  try {
    return { ok: true, value: JSON.parse(result.stdout) as T }
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: `gh api ${apiPath} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
