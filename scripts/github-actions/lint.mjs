// Entry point for repo-contract's `github-actions` check (see repo-contract.config.ts).
//
// It runs `actionlint` (rhysd/actionlint) over a repository's workflow files via the
// `github-actionlint` npm wrapper. The wrapper is a devDependency that resolves the official
// actionlint binary on first use and caches it. The whole thing therefore stays
// `npm install`-only, with no `go`/`brew`/`pip` step (ADR 0008's "package install only" bar).
// This script does not reimplement actionlint's specialized workflow analysis. It only shells out
// to actionlint and normalizes its JSON, so the tool's evidence can participate in the contract
// verdict. ADR 0010 describes this general pattern
// (specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md).
//
// The script enumerates the workflow files itself and passes them to actionlint explicitly.
// It does not rely on actionlint's own directory auto-discovery. `filesScanned` in the evidence
// is therefore an authoritative count. The policy can use it to reject a vacuous "nothing to lint"
// pass.
//
// Report-only: actionlint findings never fail this script's own process. The `github-actions`
// check's policy, which reads this same JSON evidence, makes that judgment. Only a genuine
// tool-infrastructure failure is reported as `{ ok: false, error }`. Such a failure is the binary
// not resolving, actionlint crashing, or actionlint producing unparseable output.

import { readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import spawn from "cross-spawn"

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const require = createRequire(import.meta.url)

// Resolve the `github-actionlint` wrapper's own entry file and run it through `node` directly.
// Spawning the `github-actionlint` bin by name off PATH would not work everywhere.
// `node_modules/.bin` is only on PATH under `npm run`/`npx`. It is not on PATH for a bare
// `node scripts/...` invocation or a test that imports this module.
const ACTIONLINT_ENTRY = require.resolve("github-actionlint/dist/bin/actionlint.js")

/**
 * @param root - repository root to resolve `.github/workflows/` against.
 * @returns Repository-relative POSIX paths of every `.github/workflows/*.{yml,yaml}` file, sorted for determinism.
 */
function listWorkflowFiles(root) {
  let entries
  try {
    entries = readdirSync(path.join(root, ".github", "workflows"))
  } catch {
    return []
  }
  return entries
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => path.posix.join(".github", "workflows", name))
}

/**
 * @param stdout - raw stdout from `actionlint -format '{{json .}}'`.
 * @returns the parsed finding array, or `undefined` if it did not parse to an array.
 */
function parseFindings(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }
  return Array.isArray(parsed) ? parsed : undefined
}

/**
 * Runs actionlint over `root`'s workflow files and normalizes its output into the evidence shape
 * checks/github-actions.ts's policy consumes.
 * @param root - repository root containing `.github/workflows/`.
 * @returns `{ ok: true, filesScanned, findings }`, or `{ ok: false, error }` for a tool-infrastructure failure.
 */
export function lintWorkflows(root = DEFAULT_ROOT) {
  const files = listWorkflowFiles(root)

  if (files.length === 0) {
    return { ok: true, filesScanned: 0, findings: [] }
  }

  const result = spawn.sync(
    process.execPath,
    [ACTIONLINT_ENTRY, "-format", "{{json .}}", "-no-color", ...files],
    { cwd: root, encoding: "utf8" },
  )

  if (result.error) {
    return {
      ok: false,
      error: `actionlint could not be started: ${result.error.message}. Is the \`github-actionlint\` devDependency installed?`,
    }
  }

  // Exit 0 (clean) and exit 1 (findings) from actionlint are both a successful analysis.
  // Any other exit code (or a null status) is a genuine tool failure.
  if (result.status !== 0 && result.status !== 1) {
    return {
      ok: false,
      error: `actionlint exited with status ${String(result.status)}: ${result.stderr || result.stdout || "(no output)"}`,
    }
  }

  const rawFindings = parseFindings(result.stdout ?? "")

  if (rawFindings === undefined) {
    return {
      ok: false,
      error: `actionlint did not produce a JSON array. stderr: ${result.stderr || "(none)"}`,
    }
  }

  const findings = rawFindings.map((finding) => ({
    message: typeof finding?.message === "string" ? finding.message : "(no message)",
    // The path actionlint echoes back is the exact one we passed. Keep it repo-relative and
    // POSIX-slashed.
    file:
      typeof finding?.filepath === "string"
        ? finding.filepath.split(path.sep).join("/")
        : "(unknown file)",
    line: Number.isInteger(finding?.line) ? finding.line : 0,
    column: Number.isInteger(finding?.column) ? finding.column : 0,
    kind: typeof finding?.kind === "string" ? finding.kind : "unknown",
  }))

  return { ok: true, filesScanned: files.length, findings }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = lintWorkflows()
  process.stdout.write(JSON.stringify(evidence))
  process.exitCode = evidence.ok ? 0 : 1
}
