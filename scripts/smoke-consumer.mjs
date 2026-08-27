// Standalone published-artifact smoke test -- CI's `published-floor` job runs this with a bare
// `node scripts/smoke-consumer.mjs <artifacts-dir>` on the Node versions the PUBLISHED package
// supports (the `engines.node` floor), which are older than this repository's own verification
// toolchain requires. It therefore must not touch that toolchain:
//
//   - Node built-ins only. No devDependency, no `tsx`, no vitest, no import from src/ or dist/.
//   - It never runs `npm ci` / `npm run build`. It consumes an already-packed `.tgz` (produced by
//     the `package-build` job on a modern Node) exactly as an external consumer would.
//   - Every expectation about the package's shape is a hardcoded literal below -- the black-box
//     contract a real consumer relies on. If the published `exports` surface changes, update this
//     file by hand to match; that deliberate step is the point.
//
// Exits 0 only if the packed tarball installs cleanly into a fresh project and its documented
// entry points work under both ESM `import` and CommonJS `require`.

import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NPM_COMMAND } from "./npm-pack.mjs"

/** The consumer contract, asserted from OUTSIDE the package -- literal names, no repo introspection. */
const SHARED_PROBE_BODY = `
  if (typeof defineRepoContract !== "function") throw new Error("defineRepoContract is not a function");
  if (typeof runRepoContract !== "function") throw new Error("runRepoContract is not a function");

  const config = defineRepoContract({
    checks: {
      // A guaranteed-clean no-op check: spawns this same node with an empty program, so there is
      // no external tool, no filesystem write, and nothing that could conflict on any platform.
      noop: {
        run: [process.execPath, "-e", ""],
        policy: ({ result }) =>
          result.exitCode === 0
            ? { outcome: "pass", rationale: "exited 0" }
            : { outcome: "fail", rationale: "expected exit code 0" },
      },
    },
  });

  const { verdict } = await runRepoContract(config);
  if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
  if (verdict.checks.noop.outcome !== "pass") throw new Error("expected the noop check to pass");

  require.resolve("repo-contract/presets");
  const schema = JSON.parse(readFileSync(require.resolve("repo-contract/schema"), "utf8"));
  if (typeof schema.$schema !== "string") throw new Error("schema export missing $schema");
  if (typeof schema.$id !== "string") throw new Error("schema export missing $id");
`

const ESM_PROBE = `
import { defineRepoContract, runRepoContract } from "repo-contract";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
${SHARED_PROBE_BODY}
console.log("SMOKE_ESM_OK");
`

const CJS_PROBE = `
const { defineRepoContract, runRepoContract } = require("repo-contract");
const { readFileSync } = require("node:fs");

(async () => {
${SHARED_PROBE_BODY}
  console.log("SMOKE_CJS_OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`

main()

function main() {
  const artifactsDir = process.argv[2]
  if (!artifactsDir) fail("usage: node scripts/smoke-consumer.mjs <artifacts-dir>")

  const tarball = findSingleTarball(path.resolve(artifactsDir))
  console.log(`[smoke] using tarball: ${tarball}`)

  const consumerDir = mkdtempSync(path.join(tmpdir(), "repo-contract-smoke-"))
  try {
    writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "repo-contract-smoke-consumer", version: "0.0.0", type: "module" }),
    )

    // --ignore-scripts: the published tarball ships a prebuilt `dist/`, so a consumer never needs
    // lifecycle scripts to run -- and this job deliberately runs on a Node version too old for this
    // repository's build toolchain, so it must never be coaxed into running it.
    run(
      NPM_COMMAND,
      [
        "install",
        tarball,
        "--no-save",
        "--no-package-lock",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
      ],
      consumerDir,
    )

    writeFileSync(path.join(consumerDir, "smoke.mjs"), ESM_PROBE)
    writeFileSync(path.join(consumerDir, "smoke.cjs"), CJS_PROBE)

    runProbe(consumerDir, "ESM", "smoke.mjs", "SMOKE_ESM_OK")
    runProbe(consumerDir, "CJS", "smoke.cjs", "SMOKE_CJS_OK")

    console.log(`[smoke] published artifact OK on ${process.version}`)
  } finally {
    rmSync(consumerDir, { recursive: true, force: true })
  }
}

function findSingleTarball(dir) {
  let entries
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".tgz"))
  } catch (error) {
    return fail(`cannot read artifacts dir ${dir}: ${describe(error)}`)
  }
  if (entries.length !== 1) {
    return fail(
      `expected exactly one .tgz in ${dir}, found ${entries.length}: ${entries.join(", ")}`,
    )
  }
  return path.join(dir, entries[0])
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" })
  if (result.status !== 0) {
    fail(`\`${command} ${args.join(" ")}\` exited ${String(result.status ?? result.signal)}`)
  }
}

function runProbe(consumerDir, label, file, marker) {
  const result = spawnSync(process.execPath, [file], { cwd: consumerDir, encoding: "utf8" })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.status !== 0 || !result.stdout.includes(marker)) {
    fail(
      `${label} probe failed (exit ${String(result.status)}, marker ${marker} ${result.stdout.includes(marker) ? "present" : "missing"})`,
    )
  }
  console.log(`[smoke] ${label} probe OK`)
}

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

function fail(message) {
  console.error(`[smoke] ${message}`)
  process.exit(1)
}
