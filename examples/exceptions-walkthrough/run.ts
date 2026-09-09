// Prints this walkthrough's real verdict to stdout. Run it with `npm run walkthrough` (or
// `tsx run.ts`) from this directory. Mirrors repo-contract's own scripts/run-contract.mjs: import
// the public API, load the contract, run it, print a plain summary, set process.exitCode.
import { runRepoContract } from "repo-contract"

import config from "./repo-contract.config.js"

const { verdict } = await runRepoContract(config)

process.stdout.write("\nexceptions-walkthrough\n\n")
for (const [id, result] of Object.entries(verdict.checks)) {
  process.stdout.write(`[${result.outcome.toUpperCase()}] ${id}\n`)
  for (const line of result.rationale.split("\n")) {
    process.stdout.write(`  ${line}\n`)
  }
  process.stdout.write("\n")
}
process.stdout.write(`${verdict.passed ? "PASS" : "FAIL"}\n`)

process.exitCode = verdict.passed ? 0 : 1
