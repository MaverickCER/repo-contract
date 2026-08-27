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
// this package's Node >=20.0.0 floor, and tsx is already a devDependency
// (also used by test/unit/execution/run-checks.test.ts's SIGINT fixture).

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runRepoContract } from "../dist/index.js"

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
const { default: config } = await import(path.join(root, "repo-contract.config.ts"))

const checks = process.argv.slice(2)

const { evidence, verdict } = await runRepoContract(config, checks.length > 0 ? { checks } : {})

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

    throw error
  }
}
