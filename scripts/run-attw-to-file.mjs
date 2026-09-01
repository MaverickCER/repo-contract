// Runs attw with its stdout redirected to a real file rather than a pipe.
// attw's own `--format json` output balloons past ~64KB once a package has
// more than a couple of entrypoints (this repository now has `.` and
// `./presets`), and attw has a real, reproducible bug -- confirmed
// independently of repo-contract, via plain shell piping (`attw ... | cat`
// truncates identically) -- where it truncates its own stdout once that
// happens, because it's writing to a pipe rather than a TTY or regular
// file. A regular file write doesn't hit the same OS pipe-buffer limit, so
// redirecting here sidesteps the bug entirely. Cross-platform (a plain
// Node stdio redirect, not shell `>`) rather than `sh -c`, matching every
// other non-trivial check in this repository (see scripts/check-lint.mjs,
// scripts/check-docs.mjs) -- this repository's own CI runs on Windows too.
//
// Packs the tarball itself (`npm pack --ignore-scripts`) and hands attw the resulting .tgz path,
// rather than using attw's own `--pack .` mode. attw's `--pack` runs a plain `npm pack` internally
// with no `--ignore-scripts` (confirmed: node_modules/@arethetypeswrong/cli/dist/index.js's own
// pack call); `--ignore-scripts` here keeps that pack from running any future pack/prepare
// lifecycle script this package might grow -- the sort that starts with `npm run clean` deleting
// `dist/` for the sole purpose of producing a tarball this script immediately deletes again. Run
// as one reader among many concurrently scheduled after the build barrier
// (repo-contract.config.ts), a mid-run `dist/` delete+rebuild would race every other
// concurrently-running reader of `dist/` (`test-e2e`'s own `npm pack --ignore-scripts` chief among
// them) -- the shared-mutable-state race ADR 0002 documents. Packing here explicitly, exactly like
// `test/helpers/pack-consumer.ts` already does, keeps behavior identical across the two and
// independent of attw's internal pack. (The published package currently has no `prepare` or other
// install lifecycle script; `dist/` is built by the barrier or an explicit `npm run build`.)

import { sync as spawnSync } from "cross-spawn"
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { packTarball } from "./npm-pack.mjs"

mkdirSync("reports", { recursive: true })

const packDir = mkdtempSync(path.join(tmpdir(), "repo-contract-attw-pack-"))

try {
  // packTarball() handles `--ignore-scripts` (see the note above), platform-aware `npm`
  // resolution, and tolerant parsing of `npm pack --json` -- npm 10.x prepends its own
  // ANSI-coloured log lines to that stdout, which a bare `JSON.parse` chokes on. See
  // scripts/npm-pack.mjs.
  const { tarballPath } = packTarball(packDir)

  const fd = openSync("reports/arethetypeswrong.json", "w")
  let result
  try {
    // `--exclude-entrypoints ./schema`: the `./schema` export is a bare
    // `*.schema.json` file, not a code/types entrypoint. attw's `node10`
    // resolution mode flags it (a raw JSON subpath export has no
    // node10-visible path) -- a real limitation of that legacy resolver, not a
    // packaging defect, and irrelevant to a JSON asset. Excluding it here is
    // deliberate; every actual code entrypoint (`.`, `./presets`) is still
    // fully evaluated. This is the consumer-supplied `run` override the preset
    // itself documents (src/presets/arethetypeswrong.ts) rather than guessing
    // a generic exclusion.
    //
    // cross-spawn (not execFileSync) so the Windows `attw.cmd` shim runs at
    // all -- since CVE-2024-27980's mitigation, Node refuses to exec a
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
    // attw couldn't be spawned at all -- a real infrastructure failure of this
    // wrapper, distinct from attw running and reporting packaging problems.
    throw result.error
  }

  // attw exits non-zero when it finds packaging problems -- that's substantive
  // evidence for the check's own policy to interpret, passed through verbatim.
  process.exitCode = typeof result.status === "number" ? result.status : 1
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
