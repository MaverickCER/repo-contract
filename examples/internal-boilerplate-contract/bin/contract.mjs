#!/usr/bin/env node
// The runnable entry point an organization ships with its standard, so a
// consuming project's package.json only needs:
//
//   { "scripts": { "contract": "internal-boilerplate-contract" } }
//
// It mirrors repo-contract's own scripts/run-contract.mjs: import the public API,
// load the contract definition, run it, print a color-free summary, and set
// process.exitCode -- never call process.exit() (see runRepoContract's own
// contract).
//
// The one load-bearing detail: contract.ts is resolved relative to THIS file (so
// the definition always comes from the installed package), but runRepoContract is
// called with NO cwd override, so every check defaults to process.cwd() -- the
// consumer's repository, where `npm run contract` was invoked. The package owns
// the contract; the consumer owns the execution context.

import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runRepoContract } from "repo-contract"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
// pathToFileURL, not a bare path: on Windows `import()` rejects an absolute path
// like `D:\...` as an unsupported URL scheme -- it needs a real file:// URL.
const configUrl = pathToFileURL(path.join(packageRoot, "contract.ts")).href

// tsx registers an ESM loader so the TypeScript contract.ts can be imported on
// any Node the package supports; tsx is a dependency of this package, so the
// consumer never installs it directly.
const { register } = await import("tsx/esm/api")
const unregister = register()
const { default: config } = await import(configUrl)
await unregister()

const { verdict } = await runRepoContract(config)

process.stdout.write("\ninternal-boilerplate-contract\n\n")
for (const [id, result] of Object.entries(verdict.checks)) {
  process.stdout.write(`[${result.outcome.toUpperCase()}] ${id}: ${result.rationale}\n`)
}
process.stdout.write(`\n${verdict.passed ? "PASS" : "FAIL"}\n`)

process.exitCode = verdict.passed ? 0 : 1
