// Shared `npm pack` mechanics for every place this repository packs its own
// tarball: test/helpers/pack-consumer.ts (the consumer-install E2E suites) and
// scripts/run-attw-to-file.mjs (the `arethetypeswrong` check). Kept in one
// place because two independent things were subtly wrong in both copies:
//
//   1. `npm pack --json` stdout is NOT guaranteed to be pure JSON. npm 10.x
//      prepends its own (ANSI-styled) log lines to stdout ahead of the
//      `--json` payload, so a bare `JSON.parse(stdout)` throws on the leading
//      escape byte (observed across CI's Node 22 jobs; npm 11 bundled with
//      Node 24 happens to emit clean output, which is the only reason those
//      jobs passed). `--loglevel=silent` suppresses the noise, and
//      `parseNpmPackFilename` below isolates the JSON block and asserts its
//      shape regardless, so a future npm behaviour change can't reintroduce
//      the failure silently.
//   2. On Windows `npm` is `npm.cmd`, and since the CVE-2024-27980 mitigation
//      (Node 18.20.2 / 20.12.2 / 22+) `child_process.spawnSync` refuses to run
//      a `.cmd`/`.bat` file at all unless `shell: true` -- it fails with
//      `status: null` and no captured stderr, which is exactly the opaque
//      "npm pack failed (exit null)" the E2E suite hit on windows-latest.
//      `cross-spawn` (already a runtime dependency, used the same way by
//      scripts/run-test-category.mjs) resolves `npm` -> `npm.cmd` and invokes
//      it through `cmd.exe` with correct argument quoting, with none of the
//      `shell: true` quoting hazards, so callers just pass `"npm"`.
//
// scripts/ is lower-level tooling that checks/ and test/ build on (see
// eslint.config.js's boundary rules) -- both callers importing from here is
// the allowed direction; this module never imports from either of them.

import { sync as spawnSync } from "cross-spawn"
import path from "node:path"

/** npm's command name -- `cross-spawn` resolves this to `npm.cmd` on Windows and runs it safely. */
const NPM = "npm"

const JSON_OPEN = new Set(["[", "{", "[]", "{}"])
const JSON_CLOSE = new Set(["]", "}", "[]", "{}"])

/**
 * Parses `npm pack --json` stdout into its result array, tolerant of npm prefixing its own log
 * lines (ANSI-coloured or not) ahead of the JSON payload. `--loglevel=silent` should already
 * suppress that prefix, but npm's behaviour here has varied enough across versions that this
 * doesn't rely on it: if the whole string doesn't parse, it isolates npm's pretty-printer's own
 * block -- from the first line that is exactly `[`/`{`/`[]`/`{}` to the last line that is exactly
 * `]`/`}`/`[]`/`{}` -- and parses that. npm's log lines are never exactly one of those tokens,
 * even with colour codes still attached.
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

  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0]?.filename !== "string") {
    throw new Error(
      `npm pack --json produced an unexpected shape (expected a non-empty array of { filename }).\n` +
        `stdout:\n${stdout}\nstderr:\n${stderr}`,
    )
  }

  return parsed[0].filename
}

/**
 * Runs `npm <args>` synchronously via `cross-spawn`, capturing stdout/stderr as UTF-8 text. The
 * single place this repository spawns `npm` from Node -- see this module's header for why the
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
 * `--ignore-scripts` so packing never triggers this package's own `prepare` (`npm run build`),
 * whose output would otherwise corrupt `--json` and whose `dist/` delete+rebuild would race every
 * concurrent reader (see scripts/run-attw-to-file.mjs's own note).
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

/** npm's command name -- exported for callers that still spawn npm directly; prefer `runNpm`, which resolves and invokes it safely on every platform. */
export const NPM_COMMAND = NPM
