import { execFileSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Regression guard for scripts/check-lint.mjs: ESLint and oxlint both run with `--fix`, so both
 * own writes to the same working tree. They MUST run sequentially -- run concurrently (the old
 * `Promise.all`), one rewrites a file mid-read for the other and ESLint aborts with no JSON,
 * surfacing in CI as "eslint did not produce valid JSON: Unexpected end of JSON input".
 *
 * This test replaces `eslint`/`oxlint` on PATH with stub executables that each record a start and
 * end timestamp, runs check-lint.mjs, and asserts the two run windows do not overlap. It does not
 * re-test what the tools report -- test/unit/lint/policy.test.ts owns that.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const checkLint = path.join(repoRoot, "scripts", "check-lint.mjs")

let binDir: string
let timeline: string

/** A stub executable: append `<name> start <ms>`, hold ~250ms, append `<name> end <ms>`, print `payload` as its `--format json` output. */
function writeStubTool(name: string, payload: string): void {
  const script = [
    "#!/usr/bin/env node",
    `const fs = require("node:fs");`,
    `const line = (phase) => fs.appendFileSync(${JSON.stringify(timeline)}, ${JSON.stringify(name)} + " " + phase + " " + Date.now() + "\\n");`,
    `line("start");`,
    `const until = Date.now() + 250;`,
    `while (Date.now() < until) {}`,
    `line("end");`,
    `process.stdout.write(${JSON.stringify(payload)});`,
    "",
  ].join("\n")
  const file = path.join(binDir, name)
  writeFileSync(file, script)
  chmodSync(file, 0o755)
}

interface Window {
  readonly name: string
  readonly start: number
  readonly end: number
}

function parseWindows(): Window[] {
  const events = new Map<string, Partial<Window>>()
  for (const raw of readFileSync(timeline, "utf8").trim().split("\n")) {
    const [name, phase, ms] = raw.split(" ")
    const entry = events.get(name ?? "") ?? { name }
    events.set(name ?? "", { ...entry, [phase === "start" ? "start" : "end"]: Number(ms) })
  }
  return [...events.values()].filter(
    (w): w is Window => w.start !== undefined && w.end !== undefined,
  )
}

beforeEach(() => {
  binDir = mkdtempSync(path.join(os.tmpdir(), "repo-contract-lint-race-bin-"))
  timeline = path.join(binDir, "timeline.log")
  writeFileSync(timeline, "")
  writeStubTool("eslint", "[]")
  writeStubTool("oxlint", JSON.stringify({ diagnostics: [], number_of_files: 0 }))
})

afterEach(() => {
  rmSync(binDir, { recursive: true, force: true })
})

describe("check-lint.mjs runs its two auto-fixers sequentially, never concurrently", () => {
  it.skipIf(process.platform === "win32")(
    "the eslint and oxlint run windows do not overlap",
    () => {
      const stdout = execFileSync(process.execPath, [checkLint], {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
      })

      // Sanity: check-lint.mjs actually parsed both stubs' output as a clean run.
      const parsed = JSON.parse(stdout) as { eslint: { ok: boolean }; oxlint: { ok: boolean } }
      expect(parsed.eslint.ok).toBe(true)
      expect(parsed.oxlint.ok).toBe(true)

      const windows = parseWindows()
      expect(windows).toHaveLength(2)
      const [first, second] = [...windows].sort((a, b) => a.start - b.start)
      // The second tool must not start until the first has finished.
      expect(second!.start).toBeGreaterThanOrEqual(first!.end)
    },
    30_000,
  )
})
