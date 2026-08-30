// `npm run check` -- the one command a contributor runs before opening a PR.
//
// Runs the same fast, offline subset the pre-commit hook runs (`npm run
// precommit`), streams its output through unchanged, and -- only on success --
// prints what to do next. The child's exact exit code is propagated, so this is
// a faithful pass-through wrapper, not a second gate with its own opinion.

import { spawnSync } from "node:child_process"

const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const { status } = spawnSync(npm, ["run", "precommit"], { stdio: "inherit" })

if (status === 0) {
  console.log(`
Fast checks passed.

Next:
  1. Commit with a Conventional Commit message (the editor shows the cheat sheet).
  2. Push -- the pre-push hook runs the full 'npm run contract'.
  3. Open a PR. CI re-runs everything across the OS and Node matrix.
`)
}

process.exitCode = status ?? 1
