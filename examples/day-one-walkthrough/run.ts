// Prints this walkthrough's real verdict to stdout. Run it with `npm run walkthrough` (or
// `tsx run.ts`) from this directory.
//
// Mirrors repo-contract's own scripts/run-contract.mjs and
// ../internal-boilerplate-contract/bin/contract.mjs: import the public API, load the contract, run
// it, print a plain summary, set process.exitCode -- never call process.exit().
import { runRepoContract } from "repo-contract"

import config from "./repo-contract.config.js"

const { verdict } = await runRepoContract(config)

process.stdout.write("\nday-one-walkthrough\n\n")
for (const [id, result] of Object.entries(verdict.checks)) {
  process.stdout.write(`[${result.outcome.toUpperCase()}] ${id}\n  ${result.rationale}\n\n`)
}
process.stdout.write(`${verdict.passed ? "PASS" : "FAIL"}\n`)

process.exitCode = verdict.passed ? 0 : 1
