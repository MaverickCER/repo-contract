// Fixture for run-checks.test.ts's "does not spawn a check still queued behind the concurrency
// limit" test -- see sigint-cleanup.ts's own doc comment for why this needs a real, separate child
// process rather than sending SIGINT to vitest's own process.
//
// Configures concurrency: 1 with two checks declared in order, so `second` cannot start until
// `first`'s slot frees. `first` writes its own pid to argv[2] then sleeps, exactly like
// sigint-cleanup.ts's single check. `second` writes a marker file (argv[3]) the instant it spawns
// -- proving, if that file exists once this process has exited, that `second` was launched despite
// the host process having already begun SIGINT cleanup with only `first` in flight.
import { spawn } from "node:child_process"
import { runChecks } from "../../../../src/execution/run-checks.js"
import type { PolicyResult } from "../../../../src/types.js"

const pidFilePath = process.argv[2]
const queuedMarkerPath = process.argv[3]
if (pidFilePath === undefined || queuedMarkerPath === undefined) {
  throw new Error("usage: sigint-cleanup-queued.ts <pid-file-path> <queued-marker-path>")
}

const first = {
  run: [
    process.execPath,
    "-e",
    `require("node:fs").writeFileSync(${JSON.stringify(pidFilePath)}, String(process.pid)); setTimeout(() => {}, 30000)`,
  ],
  policy: (): PolicyResult => ({ outcome: "pass", rationale: "ok" }),
}

const second = {
  run: [
    process.execPath,
    "-e",
    `require("node:fs").writeFileSync(${JSON.stringify(queuedMarkerPath)}, "spawned")`,
  ],
  policy: (): PolicyResult => ({ outcome: "pass", rationale: "ok" }),
}

runChecks({ first, second }, 1, { spawn, env: process.env, shell: false }, undefined)
  .then(() => {
    process.stdout.write("DONE\n")
  })
  .catch(() => {
    process.stdout.write("ERROR\n")
  })
