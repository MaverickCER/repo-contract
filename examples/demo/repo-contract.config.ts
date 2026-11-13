/**
 * The tiny, real contract behind the README's opening demo.
 *
 * Every check below is a real, published `repo-contract/presets` entry, run
 * against `src/greet.ts` (see that file's own comment for exactly what's
 * intentional about it): nothing here is a mockup or a hand-built policy.
 * `typecheck` passes, `format` fails, and `lint` warns, deterministically,
 * regardless of what machine or Node version this runs on: no coverage
 * percentage, no mutation score, nothing that could shift between runs.
 *
 * Run it with `npm run demo` from this directory (or `tsx run.ts`): see
 * ./README.md.
 */
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { format, lint, typecheck } from "repo-contract/presets"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    typecheck,
    // The preset runs `prettier --write`, which rewrites the file. `--check`
    // reports it instead, so the demo shows a repeatable failure.
    format: { ...format, run: ["prettier", "--check", "."] },
    lint: lint(),
  },
})
