// The thin script `npm run contract` invokes -- imports the built package's
// own public API (not a special internal shortcut) and runs it against this
// repository's own repo-contract.config.ts, so this really is repo-contract
// validating itself using itself, not a fixture standing in for it. Prints
// a human-readable summary (readable without color, per SECURITY.md/README's
// accessibility notes) and sets process.exitCode -- never calls
// process.exit() directly (see src/run-repo-contract.ts's own doc comment
// for why the library itself never does either).
//
// Run via `npm run contract`, which invokes this through `tsx` -- plain
// `node` has no built-in loader for repo-contract.config.ts's TypeScript on
// this package's Node >=22.0.0 floor, and tsx is already a devDependency
// (also used by test/unit/execution/run-checks.test.ts's SIGINT fixture).

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { scopedEnv } from "./contract-env.mjs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"
import { parseFailFastArgs, resolveFailFast } from "../dist/affected.js"
import { runRepoContract } from "../dist/index.js"
import { buildEvidenceManifest, createRunRecord, serializeRunRecord } from "../dist/metrics.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const historyPath = path.join(root, "history.json")
// Each run's evidence includes every check's full stdout/stderr (now capped
// per-check at 10 MiB by src/execution/spawn-check.ts, but still real
// content, not a summary) -- keeping every run ever executed would grow this
// file without bound, exactly what was observed in practice (tens of MB
// after only a handful of local runs). This is a local developer scratch
// log, not the check's actual pass/fail record (that's `npm run contract`'s
// own exit code and printed summary each time), so bounding it to the most
// recent runs loses nothing load-bearing.
const MAX_HISTORY_ENTRIES = 20
// pathToFileURL, not a bare path: on Windows `import()` treats an absolute
// path like `D:\...` as a URL with scheme `d:` and rejects it
// (ERR_UNSUPPORTED_ESM_URL_SCHEME) -- it requires a real file:// URL.
const { default: config } = await import(
  pathToFileURL(path.join(root, "repo-contract.config.ts")).href
)

// The docs link to the benchmark page, which is generated and never committed; build it first, the way every
// package that runs internal-package-contract's own contract does.
const { prepare } = await import(
  pathToFileURL(
    path.join(root, "node_modules", "internal-package-contract", "scripts", "contract-prepare.mjs"),
  ).href
)
prepare({ cwd: root, out: process.stdout })

// `--fail-fast` (or REPO_CONTRACT_FAIL_FAST=1) skips the slow checks once a cheap one has failed. Off
// by default, so a run reports every problem, and never on for a release (see resolveFailFast).
const { failFast: failFastFlag, rest: checks } = parseFailFastArgs(process.argv.slice(2))
const failFast = resolveFailFast({ flag: failFastFlag, env: process.env })
// The checks that dominate a run's time; the rest are cheap. Fail-fast skips only these.
const EXPENSIVE = new Set([
  "test-unit",
  "test-integration",
  "test-property",
  "coverage",
  "crap",
  "mutation",
])
// Every check runs with an explicit, minimal environment (scripts/contract-env.mjs), never the
// whole of this process's: the release job inherits secrets, and a check never needs them.
const env = scopedEnv(process.env)
const runConfig = {
  ...config,
  checks: Object.fromEntries(
    Object.entries(config.checks).map(([id, check]) => [
      id,
      {
        ...check,
        inheritEnv: false,
        env: { ...env, ...check.env },
        ...(EXPENSIVE.has(id) ? { expensive: true } : {}),
      },
    ]),
  ),
}

const startedAt = new Date()
const { evidence, verdict } = await runRepoContract(runConfig, {
  ...(checks.length > 0 ? { checks } : {}),
  ...(failFast ? { failFast: true } : {}),
})
await recordRun(evidence, verdict, startedAt, checks.length === 0)
await writeManifest(evidence, verdict, checks.length === 0 && verdict.passed)

await appendHistory(evidence, verdict)

process.stdout.write("\n\nrepo-contract self-assurance results:\n\n\n")
for (const [id, checkVerdict] of Object.entries(verdict.checks)) {
  const checkEvidence = evidence.checks[id]
  printCheck(id, checkVerdict, checkEvidence)
}

process.stdout.write(
  `\n${verdict.passed ? "PASS" : "FAIL"}: ${String(Object.keys(verdict.checks).length)} check(s), ` +
    `${String(Object.values(verdict.checks).filter((c) => c.outcome !== "fail").length)} passed.\n`,
)

process.exitCode = verdict.passed ? 0 : 1

function printCheck(id, checkVerdict, checkEvidence) {
  const status = checkVerdict.outcome.toUpperCase()
  process.stdout.write(
    `[${status}] ${id} (${String(checkEvidence.durationMs)}ms)\n${checkVerdict.rationale}\n\n`,
  )
}

// Appends one line to the local run log that `repo-contract metrics` summarizes. Only a run of every
// check is recorded: a subset is not comparable with the rest. A failure to write is reported, never fatal.
async function recordRun(evidence, verdict, startedAt, complete) {
  if (!complete) return
  try {
    const record = createRunRecord({
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      scope: "full",
      checks: Object.entries(verdict.checks).map(([id, checkVerdict]) => ({
        id,
        durationMs: evidence.checks[id].durationMs,
        verdict: checkVerdict.outcome,
      })),
    })
    const directory = path.join(root, ".repo-contract", "metrics")
    await mkdir(directory, { recursive: true })
    await appendFile(path.join(directory, "runs.jsonl"), serializeRunRecord(record), "utf8")
  } catch (error) {
    console.warn(
      `[run-contract] could not record this run: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

// Writes the evidence manifest this repository's own README describes: a digest-sealed statement that a
// full, cache-free run of every check passed, with each check's verdict, the hash of its evidence,
// the tool versions, and the commit it looked at. Only a passing run of every check gets one (a
// subset or a failure proves nothing about the release), and only when the commit can be read. The
// file lives under reports/, which is not committed; the release workflow is where it would be attested.
async function writeManifest(evidence, verdict, complete) {
  if (!complete) return
  // The manifest names a commit, so it is written only when the tree IS that commit: a dirty
  // working tree would make it say that HEAD passed when HEAD plus local edits did.
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "")
    return
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim()
    const manifest = buildEvidenceManifest({
      package: { name: packageJson.name, version: packageJson.version },
      createdAt: new Date().toISOString(),
      scope: "full",
      cache: "bypassed",
      inputHash: commit,
      tools: { node: process.versions.node, "repo-contract": packageJson.version },
      subject: { commit },
      checks: Object.entries(verdict.checks).map(([id, checkVerdict]) => ({
        id,
        verdict: checkVerdict.outcome,
        evidence: evidence.checks[id],
      })),
    })
    const directory = path.join(root, "reports")
    await mkdir(directory, { recursive: true })
    await writeFile(
      path.join(directory, "evidence-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    )
  } catch (error) {
    console.warn(
      `[run-contract] could not write the evidence manifest: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function appendHistory(evidence, verdict, shouldSave = true) {
  if (!shouldSave) return
  let history = await loadHistory()
  history.push({ evidence, verdict })
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(history.length - MAX_HISTORY_ENTRIES)
  }
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8")
}

async function loadHistory() {
  try {
    const raw = await readFile(historyPath, "utf8")
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      throw new Error("history.json must contain a JSON array.")
    }

    return parsed
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await writeFile(historyPath, "[]\n", "utf8")
      return []
    }

    // A corrupt or non-array history.json is a disposable local scratch log
    // (see MAX_HISTORY_ENTRIES's note) -- reset it and carry on rather than
    // crashing the run before its summary and exit code are emitted.
    console.warn(
      `[run-contract] ${path.relative(root, historyPath)} was unreadable ` +
        `(${error instanceof Error ? error.message : String(error)}); resetting it.`,
    )
    await writeFile(historyPath, "[]\n", "utf8")
    return []
  }
}
