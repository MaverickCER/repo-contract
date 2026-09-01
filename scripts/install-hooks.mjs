// Wires this repository's own local git config for contributors:
//   - core.hooksPath -> .githooks (commit-msg, pre-commit, pre-push)
//   - commit.template -> <repo root>/.gitmessage (Conventional Commits cheat sheet
//     shown in the editor on every `git commit`)
//
// Run from the `setup` npm script (`npm run setup`, one command after
// `npm install` in a fresh clone -- see
// specs/decisions/0009-conventional-commits-versioning-and-local-gates.md). It is
// deliberately NOT an npm lifecycle hook (`prepare` etc.): the published package
// ships with no install scripts at all, so consumers' `npm install` never runs
// this.
//
// Idempotent and deliberately unobtrusive, for BOTH settings:
//   - no-op when CI is set: the release workflow's own bots (release-please,
//     api-baseline) commit and push and must not be intercepted or reconfigured.
//   - no-op outside a git checkout (run from an unpacked tarball, etc.).
//   - never overrides a value a contributor set themselves.
//
// Reverting: `git config --unset core.hooksPath` and, if desired,
// `git config --unset commit.template`.

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const HOOKS_PATH = ".githooks"

function gitConfigGet(key) {
  try {
    return execFileSync("git", ["config", "--local", "--get", key], { encoding: "utf8" }).trim()
  } catch {
    // exit code 1 == key not set
    return ""
  }
}

function gitConfigSet(key, value) {
  try {
    execFileSync("git", ["config", "--local", key, value])
    return true
  } catch (error) {
    // `npm run setup` must never hard-fail -- if git is somehow unavailable
    // here despite `.git` existing, warn and move on.
    console.warn(
      `[install-hooks] could not set ${key} (${error instanceof Error ? error.message : String(error)}); skipping.`,
    )
    return false
  }
}

/**
 * Wires one local git config value, honoring the "never clobber a contributor's own
 * choice" rule. Returns a short status string for the caller to log.
 * @param key - The git config key, e.g. `core.hooksPath`.
 * @param value - The value this repository wants.
 * @param hint - How a contributor would opt in manually, shown when their own value is left alone.
 */
function wire(key, value, hint) {
  const current = gitConfigGet(key)
  if (current === value) return `${key} already set`
  if (current !== "") {
    console.warn(`[install-hooks] ${key} is set to '${current}'; leaving it. ${hint}`)
    return `${key} left as contributor's own`
  }
  return gitConfigSet(key, value) ? `${key} = ${value}` : `${key} could not be set`
}

if (process.env.CI) {
  process.exit(0)
}

// `.git` is a directory in a normal clone, a file in a worktree/submodule, and
// absent when the package is unpacked from a tarball -- `existsSync` covers the
// first two and rejects the third.
if (!existsSync(".git")) {
  process.exit(0)
}

// `commit.template` is resolved by git relative to the cwd of `git commit`, not
// the repo root -- so a relative value breaks when committing from a
// subdirectory. Store an absolute path. It lands only in per-clone .git/config,
// which is never committed, so machine-specificity is fine. `npm run setup` runs
// this script from the repo root; resolve against that.
const repoRoot = process.cwd()
const commitTemplate = path.join(repoRoot, ".gitmessage")

const results = [
  wire("core.hooksPath", HOOKS_PATH, `Run 'git config core.hooksPath ${HOOKS_PATH}' to use them.`),
  wire(
    "commit.template",
    commitTemplate,
    `Run 'git config commit.template ${commitTemplate}' to use it.`,
  ),
]

console.log(`[install-hooks] ${results.join("; ")}`)
