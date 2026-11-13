// Prints a contract's real verdict to stdout: this is what produced the
// output blocks the README quotes. `npm run demo` runs ./repo-contract.config.ts;
// `npm run ai-review` passes ai-review.config.ts as the argument.
//
// Mirrors repo-contract's own scripts/run-contract.mjs and
// ../internal-boilerplate-contract/bin/contract.mjs: import the public API,
// load the contract, run it, print a plain summary, set process.exitCode;
// never call process.exit() (see runRepoContract's own contract).
import { fileURLToPath } from "node:url"

import { runRepoContract } from "repo-contract"

const configFile = process.argv[2] ?? "repo-contract.config.ts"
const { default: config } = (await import(new URL(configFile, import.meta.url).href)) as {
  readonly default: Parameters<typeof runRepoContract>[0]
}

const { verdict } = await runRepoContract(config)

// A rationale is free-form multi-line text. Two presentation-only touch-ups so
// the transcript in the README is clean and identical on every machine:
//  - indent every line under its `[OUTCOME] id` header, not just the first;
//  - rewrite this directory's absolute path to a relative one (ESLint's JSON
//    reporter emits an absolute `filePath`; Prettier already prints relative).
//    Neither changes what a policy decided: only how this demo prints it.
const here = fileURLToPath(new URL("./", import.meta.url))
const present = (rationale: string): string =>
  rationale.split(here).join("").split("\n").join("\n  ")

for (const [id, result] of Object.entries(verdict.checks)) {
  process.stdout.write(
    `[${result.outcome.toUpperCase()}] ${id}\n  ${present(result.rationale)}\n\n`,
  )
}

process.exitCode = verdict.passed ? 0 : 1
