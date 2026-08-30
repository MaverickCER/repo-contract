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
// rather than using attw's own `--pack .` mode: attw's `--pack` runs a plain `npm pack` internally
// with no `--ignore-scripts` (confirmed: node_modules/@arethetypeswrong/cli/dist/index.js's own
// pack call), which triggers this package's own `prepare` lifecycle script (`npm run build`) --
// starting with `npm run clean`, which deletes `dist/` -- for the sole purpose of producing a
// tarball this script immediately deletes again. Run as one reader among many concurrently
// scheduled after the build barrier (repo-contract.config.ts), that mid-run `dist/` delete+rebuild
// races every other concurrently-running reader that reads `dist/` (`test-e2e`'s own
// `npm pack --ignore-scripts` chief among them) -- the same shared-mutable-state race ADR 0012
// documents, just via a dependency's own internal side effect rather than this repository's code.
// Packing here instead, exactly like `test/helpers/pack-consumer.ts` already does for the same
// reason, removes the shared-state write entirely rather than trying to schedule around it.

import { execFileSync } from "node:child_process"
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
    execFileSync("attw", [tarballPath, "--format", "json", "--exclude-entrypoints", "./schema"], {
      stdio: ["ignore", fd, "inherit"],
    })
    process.exitCode = 0
  } catch (error) {
    // attw exits non-zero when it finds packaging problems -- that's
    // substantive evidence for the check's own policy to interpret, not an
    // infrastructure failure of this wrapper script itself.
    process.exitCode = typeof error.status === "number" ? error.status : 1
  } finally {
    closeSync(fd)
  }
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
