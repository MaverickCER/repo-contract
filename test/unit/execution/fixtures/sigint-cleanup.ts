// Fixture for run-checks.test.ts's SIGINT-propagation test. Runs as a real,
// separate Node process (spawned by the test, via tsx so it can import the
// TypeScript source directly with no build step required first) so a real
// SIGINT can be sent to it from outside -- vitest's own process is the host
// for every other test in this suite, so this is the only way to actually
// exercise "the host process receiving SIGINT" for real.
//
// The check's own stdout is only observable through the public API once its
// evidence resolves, which won't happen here (the whole point is that we
// SIGINT before it can finish) -- so the spawned check process instead
// writes its own pid to the file path given as argv[2], a side channel the
// test can poll independently of runChecks' own return value.
import { runChecks } from "../../../../src/execution/run-checks.js"
import type { PolicyResult } from "../../../../src/types.js"

const pidFilePath = process.argv[2]
if (pidFilePath === undefined) {
  throw new Error("usage: sigint-cleanup.ts <pid-file-path>")
}

const check = {
  run: [
    process.execPath,
    "-e",
    `require("node:fs").writeFileSync(${JSON.stringify(pidFilePath)}, String(process.pid)); setTimeout(() => {}, 30000)`,
  ],
  policy: (): PolicyResult => ({ outcome: "pass", rationale: "ok" }),
}

runChecks({ longRunning: check }, 1, undefined)
  .then(() => {
    process.stdout.write("DONE\n")
  })
  .catch(() => {
    process.stdout.write("ERROR\n")
  })
