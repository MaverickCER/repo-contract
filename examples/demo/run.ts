// Prints this demo's real verdict to stdout -- this is what produced the
// output block in the README's opening demo, copy-pasted verbatim. Run it
// yourself with `npm run demo` (or `tsx run.ts`) from this directory.
//
// Mirrors repo-contract's own scripts/run-contract.mjs and
// ../internal-boilerplate-contract/bin/contract.mjs: import the public API,
// load the contract, run it, print a plain summary, set process.exitCode --
// never call process.exit() (see runRepoContract's own contract).
import { runRepoContract } from "repo-contract"
import config from "./repo-contract.config.js"

const { verdict } = await runRepoContract(config)

for (const [id, result] of Object.entries(verdict.checks)) {
  process.stdout.write(`[${result.outcome.toUpperCase()}] ${id}\n  ${result.rationale}\n\n`)
}

process.exitCode = verdict.passed ? 0 : 1
