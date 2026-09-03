// Verifies the actual published npm artifact never spawns a process or reads
// ambient environment state itself -- the concrete, automated stand-in for
// the invariant behind
// specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md:
// repo-contract's own shipped code never imports child_process/cross-spawn
// or reads process.env directly, since both are required, consumer-supplied
// RepoContractConfig fields (`spawn`/`env`) instead.
//
// Textual/dependency-graph defense-in-depth, not a formal semantic proof:
// this catches literal reintroduction (a stray `require("child_process")`, a
// `process.env` reference, `cross-spawn` creeping back into
// `dependencies`) -- it cannot prove the absence of every possible evasion
// (further bundler transforms, computed property access, and so on).
//
// Runs against a REAL `npm pack` tarball (via scripts/npm-pack.mjs's shared
// `packTarball`), not just local dist/ -- the tarball is what a consumer
// actually receives, and is the one artifact both checks below (source text,
// declared dependency graph) can be verified against together.

import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { packTarball } from "./npm-pack.mjs"

const FORBIDDEN_SOURCE_PATTERNS = [
  { name: 'require("cross-spawn")', pattern: /require\(["']cross-spawn["']\)/ },
  { name: 'require("child_process")', pattern: /require\(["']child_process["']\)/ },
  { name: 'require("node:child_process")', pattern: /require\(["']node:child_process["']\)/ },
  { name: 'from "child_process"', pattern: /from ["']child_process["']/ },
  { name: 'from "node:child_process"', pattern: /from ["']node:child_process["']/ },
  { name: "process.env", pattern: /\bprocess\.env\b/ },
]

const RUNTIME_JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"])

/**
 * Recursively collects every runtime JS file (`.js`/`.cjs`/`.mjs`) under `dir` -- deliberately
 * excludes `.d.ts`/`.d.cts` declaration files, which carry type-only references (erased at build
 * time) that are not runtime imports.
 * @param dir - directory to walk.
 * @returns absolute paths of every runtime JS file found.
 */
function findRuntimeJsFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findRuntimeJsFiles(full))
    } else if (RUNTIME_JS_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

/**
 * Extracts a real `npm pack` tarball into `destinationDir` -- shells out to the system `tar`
 * binary (present on macOS/Linux always, and on Windows since 10 1803 as bsdtar) rather than
 * adding a parsing dependency; this script is dev-only tooling (scripts/ is not part of the
 * published `files`), so that's an acceptable, simple choice here.
 * @param tarballPath - absolute path to the `.tgz` file.
 * @param destinationDir - directory to extract into (must already exist).
 */
function extractTarball(tarballPath, destinationDir) {
  execFileSync("tar", ["xzf", tarballPath, "-C", destinationDir], { stdio: "pipe" })
}

function main() {
  const scratchDir = mkdtempSync(path.join(tmpdir(), "repo-contract-verify-ambient-"))
  try {
    const { tarballPath } = packTarball(scratchDir)
    extractTarball(tarballPath, scratchDir)

    const packageDir = path.join(scratchDir, "package")
    if (!statSync(packageDir).isDirectory()) {
      throw new Error(`expected an extracted "package" directory at ${packageDir}`)
    }

    const packedPackageJson = JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    )
    const dependencyViolations = Object.keys(packedPackageJson.dependencies ?? {}).filter(
      (name) => name === "cross-spawn",
    )

    const sourceViolations = []
    for (const file of findRuntimeJsFiles(packageDir)) {
      const text = readFileSync(file, "utf8")
      for (const { name, pattern } of FORBIDDEN_SOURCE_PATTERNS) {
        if (pattern.test(text)) {
          sourceViolations.push(`${path.relative(packageDir, file)}: ${name}`)
        }
      }
    }

    if (dependencyViolations.length > 0 || sourceViolations.length > 0) {
      const lines = [
        "verify-no-ambient-capabilities: the published tarball violates the consumer-supplied-capability invariant (see specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md):",
        ...dependencyViolations.map((name) => `  dependency: ${name}`),
        ...sourceViolations.map((line) => `  source: ${line}`),
      ]
      console.error(lines.join("\n"))
      process.exitCode = 1
      return
    }

    console.log(
      "[verify-no-ambient-capabilities] OK -- no forbidden runtime imports or ambient env reads in the published tarball.",
    )
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
}

main()
