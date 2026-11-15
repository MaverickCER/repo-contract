// Runs attw with its stdout redirected to a regular file rather than a pipe.
// The `--format json` output of attw balloons past ~64KB once a package has
// more than a couple of entrypoints. This repository has five code
// entrypoints: `.`, `./presets`, `./helpers`, `./affected` and `./metrics`.
// Past that size, attw truncates its stdout when writing to a pipe rather
// than a TTY or regular file. Plain shell piping reproduces it outside
// repo-contract: `attw ... | cat` truncates the same way. A regular file
// write doesn't hit the OS pipe-buffer limit, so redirecting here sidesteps
// the bug.
//
// The redirect is cross-platform (a plain Node stdio redirect, not shell
// `>`) rather than `sh -c`. That matches every other non-trivial check in
// this repository (see scripts/check-lint.mjs, scripts/check-docs.mjs).
// This repository's CI runs on Windows too.
//
// Packs the tarball itself (`npm pack --ignore-scripts`) and hands attw the resulting .tgz path,
// rather than using attw's `--pack .` mode. The `--pack` mode runs a plain `npm pack`
// internally with no `--ignore-scripts` (see the pack call in
// node_modules/@arethetypeswrong/cli/dist/index.js). `--ignore-scripts` here keeps
// that pack from running any future pack/prepare lifecycle script this package might grow.
// The risk is a script such as `npm run clean` deleting `dist/`, only to produce a tarball
// this script deletes again.
//
// This runs as one reader among many concurrently scheduled after the build barrier
// (repo-contract.config.ts). A mid-run `dist/` delete+rebuild would race every other
// concurrently-running reader of `dist/`, with `test-e2e`'s `npm pack --ignore-scripts` chief
// among them. That is the shared-mutable-state race ADR 0002 documents.
// `test/helpers/pack-consumer.ts` packs explicitly the same way. That keeps behavior identical
// across the two and independent of attw's internal pack. The published package has no `prepare`
// or other install lifecycle script. `dist/` is built by the barrier or an explicit
// `npm run build`.

import { sync as spawnSync } from "cross-spawn"
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { packTarball } from "./npm-pack.mjs"

mkdirSync("reports", { recursive: true })

const packDir = mkdtempSync(path.join(tmpdir(), "repo-contract-attw-pack-"))

try {
  // packTarball() handles `--ignore-scripts` (see the note above) and platform-aware `npm`
  // resolution. It also parses `npm pack --json` tolerantly. Version 10.x of npm prepends its
  // ANSI-coloured log lines to that stdout, which a bare `JSON.parse` chokes on. See
  // scripts/npm-pack.mjs.
  const { tarballPath } = packTarball(packDir)

  const fd = openSync("reports/arethetypeswrong.json", "w")
  let result
  try {
    // `--exclude-entrypoints ./schema`: the `./schema` export is a bare
    // `*.schema.json` file, not a code/types entrypoint. The `node10`
    // resolution mode in attw flags it, because a raw JSON subpath export has
    // no node10-visible path. That is a limitation of that legacy
    // resolver, not a packaging defect, and irrelevant to a JSON asset.
    // Excluding it here is deliberate. Every code entrypoint (`.`,
    // `./presets`, `./helpers`, `./affected`, `./metrics`) is still fully
    // evaluated. This is the consumer-supplied `run` override the preset
    // itself documents (src/presets/arethetypeswrong.ts) rather than guessing
    // a generic exclusion.
    //
    // Uses cross-spawn (not execFileSync) so the Windows `attw.cmd` shim runs
    // at all. Since CVE-2024-27980's mitigation, Node refuses to exec a
    // `.cmd`/`.bat` without `shell: true` (see scripts/npm-pack.mjs's note #2).
    result = spawnSync(
      "attw",
      [tarballPath, "--format", "json", "--exclude-entrypoints", "./schema"],
      { stdio: ["ignore", fd, "inherit"] },
    )
  } finally {
    closeSync(fd)
  }

  if (result.error) {
    // The attw process couldn't be spawned at all. That is an infrastructure
    // failure of this wrapper, distinct from attw running and reporting packaging problems.
    throw result.error
  }

  // The attw tool exits non-zero when it finds packaging problems. That's substantive
  // evidence for the check's policy to interpret, passed through verbatim.
  process.exitCode = typeof result.status === "number" ? result.status : 1
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
