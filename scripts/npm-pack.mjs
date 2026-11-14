// Shared `npm pack` mechanics for every place this repository packs its own
// tarball: test/helpers/pack-consumer.ts (the consumer-install E2E suites) and
// scripts/run-attw-to-file.mjs (the `arethetypeswrong` check). Kept in one
// place because two independent things were subtly wrong in both copies:
//
//   1. `npm pack --json` stdout is NOT guaranteed to be pure JSON. Version
//      10.x of npm prepends its own (ANSI-styled) log lines to stdout ahead
//      of the `--json` payload. A bare `JSON.parse(stdout)` then throws on
//      the leading escape byte. This was observed across CI's Node 22 jobs.
//      The npm 11 bundled with Node 24 happens to emit clean output, which
//      is the only reason those jobs passed. `--loglevel=silent` suppresses
//      the noise. `parseNpmPackFilename` below isolates the JSON block and
//      asserts its shape regardless. A future npm behaviour change therefore
//      can't reintroduce the failure silently.
//   2. On Windows `npm` is `npm.cmd`. Since the CVE-2024-27980 mitigation
//      (Node 18.20.2 / 20.12.2 / 22+), `child_process.spawnSync` refuses to
//      run a `.cmd`/`.bat` file at all unless `shell: true`. It fails with
//      `status: null` and no captured stderr. That is exactly the opaque
//      "npm pack failed (exit null)" the E2E suite hit on windows-latest.
//      `cross-spawn` is already a devDependency, used the same way by
//      scripts/run-test-category.mjs. It resolves `npm` -> `npm.cmd` and
//      invokes it through `cmd.exe` with correct argument quoting. None of
//      the `shell: true` quoting hazards apply, so callers pass `"npm"`.
//
// The scripts/ tree is lower-level tooling that checks/ and test/ build on
// (see eslint.config.js's boundary rules). Both callers importing from here
// is the allowed direction. This module never imports from either of them.

import { sync as spawnSync } from "cross-spawn"
import path from "node:path"

/** npm's command name: `cross-spawn` resolves this to `npm.cmd` on Windows and runs it safely. */
const NPM = "npm"

const JSON_OPEN = new Set(["[", "{", "[]", "{}"])
const JSON_CLOSE = new Set(["]", "}", "[]", "{}"])

/**
 * Parses `npm pack --json` stdout into its result array, tolerant of npm prefixing its own log
 * lines (ANSI-coloured or not) ahead of the JSON payload. `--loglevel=silent` should already
 * suppress that prefix. npm's behaviour here has varied enough across versions that this
 * doesn't rely on it. If the whole string doesn't parse, it isolates npm's pretty-printer's own
 * block and parses that. The block runs from the first line that is exactly `[`/`{`/`[]`/`{}`
 * to the last line that is exactly `]`/`}`/`[]`/`{}`. The log lines npm writes are never
 * exactly one of those tokens, even with colour codes still attached.
 * @param stdout - Raw stdout from `npm pack --json`.
 * @returns The parsed result array (`[{ filename, ... }, ...]`), or `undefined` if nothing parses.
 */
function parseNpmPackJson(stdout) {
  const attempt = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  const whole = attempt(stdout.trim())
  if (whole !== undefined) return whole

  const lines = stdout.split(/\r?\n/)
  const startIdx = lines.findIndex((line) => JSON_OPEN.has(line.trim()))
  if (startIdx === -1) return undefined
  let endIdx = -1
  for (let i = lines.length - 1; i >= startIdx; i--) {
    if (JSON_CLOSE.has(lines[i].trim())) {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) return undefined

  return attempt(lines.slice(startIdx, endIdx + 1).join("\n"))
}

/**
 * The result entries of a parsed `npm pack --json` payload. Versions <= 11 of npm emit an array
 * of results. Version 12 emits an object keyed by package name instead, so both are accepted.
 * @param parsed - The parsed JSON payload.
 * @returns The result entries (`[]` for any other shape).
 */
function packEntries(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed === "object" && parsed !== null) return Object.values(parsed)
  return []
}

/**
 * Extracts the packed tarball's filename from `npm pack --json` output.
 * @param stdout - Raw stdout from `npm pack --json`.
 * @param stderr - Raw stderr, included verbatim in the thrown error when parsing fails.
 * @returns The single packed tarball's `filename`.
 */
export function parseNpmPackFilename(stdout, stderr = "") {
  const parsed = parseNpmPackJson(stdout)

  if (parsed === undefined) {
    throw new Error(
      `npm pack --json did not produce parseable JSON.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    )
  }

  const entries = packEntries(parsed)
  if (entries.length === 0 || typeof entries[0]?.filename !== "string") {
    throw new Error(
      `npm pack --json produced an unexpected shape (expected a non-empty array, or object, of { filename }).\n` +
        `stdout:\n${stdout}\nstderr:\n${stderr}`,
    )
  }

  return entries[0].filename
}

/**
 * Runs `npm <args>` synchronously via `cross-spawn`, capturing stdout/stderr as UTF-8 text. The
 * single place this repository spawns `npm` from Node: see this module's header for why the
 * plain `child_process` route is a Windows footgun.
 * @param args - Arguments to pass to `npm` (e.g. `["install", tarball, "--no-save"]`).
 * @param options - Optional `cwd` for the invocation.
 * @returns The `spawnSync` result (`status`, `stdout`, `stderr`, `error`, ...).
 */
export function runNpm(args, options = {}) {
  return spawnSync(NPM, args, { cwd: options.cwd, encoding: "utf8" })
}

/**
 * Runs a real `npm pack` into `destinationDir` and returns where the tarball landed.
 * `--ignore-scripts` keeps packing side-effect-free and deterministic. It must never run a
 * build. A build's stdout would corrupt `--json`, and its `dist/` delete+rebuild would race every
 * concurrent reader (see scripts/run-attw-to-file.mjs's own note). `dist/` is expected to be
 * already built by the time this runs, by the build barrier in repo-contract.config.ts or an
 * explicit `npm run build`. The published package has no `prepare` or other install lifecycle
 * script.
 * @param destinationDir - Directory the `.tgz` is written into (must already exist).
 * @param options - Optional `cwd` for the `npm pack` invocation (defaults to the current directory).
 * @returns The tarball's `filename` and its full `tarballPath` inside `destinationDir`.
 */
export function packTarball(destinationDir, options = {}) {
  const result = runNpm(
    [
      "pack",
      "--pack-destination",
      destinationDir,
      "--json",
      "--loglevel=silent",
      "--ignore-scripts",
    ],
    { cwd: options.cwd },
  )

  if (result.error) {
    throw new Error(`npm pack could not be spawned: ${result.error.message}`, {
      cause: result.error,
    })
  }
  if (result.status !== 0) {
    throw new Error(
      `npm pack failed (exit ${String(result.status)}):\n${result.stderr || result.stdout}`,
    )
  }

  const filename = parseNpmPackFilename(result.stdout, result.stderr)
  return { filename, tarballPath: path.join(destinationDir, filename) }
}
