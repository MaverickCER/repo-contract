import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createConsumerFixture,
  distIsBuilt,
  isRuntimeAvailable,
  removeConsumerFixture,
} from "../helpers/pack-consumer.js"

/**
 * Bun counterpart to consumer-install.test.ts -- see
 * specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md. Proves the real packed tarball resolves
 * and runs under Bun with no non-default permissions, covering both entry points (`import` and
 * `require`) and the `./presets` subpath export -- the compatibility surface most likely to differ
 * across runtimes, since it depends on each runtime's own module resolution and CJS interop rather
 * than on anything this package controls. Skips (not fails) when `bun` isn't on `PATH`, same
 * reasoning as `distIsBuilt` below: most CI jobs and most local machines don't have Bun installed,
 * and that's a legitimate, common state, not a broken one. CI's dedicated `runtime-compat` job (see
 * .github/workflows/ci.yml) is what actually exercises this suite for real.
 */
const bunAvailable = isRuntimeAvailable("bun")

describe.skipIf(!distIsBuilt || !bunAvailable)("consumer install (packed tarball) via Bun", () => {
  let consumerDir: string

  beforeAll(() => {
    ;({ consumerDir } = createConsumerFixture("repo-contract-consumer-bun-"))
  }, 120_000)

  afterAll(() => {
    removeConsumerFixture(consumerDir)
  })

  it("imports defineRepoContract and runRepoContract from the installed package", () => {
    const script = `
      import { defineRepoContract, runRepoContract } from "repo-contract";

      const config = defineRepoContract({
        checks: {
          // Bun's own binary as the spawned command: universally exits 0, unlike "node -e" style
          // eval flags, which aren't a cross-runtime-portable assumption.
          ok: {
            run: [process.execPath, "--version"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "exited 0" }
                : { outcome: "fail", rationale: "expected exit code 0" },
          },
        },
      });

      const { evidence, verdict } = await runRepoContract(config);

      if (evidence.version !== 1) throw new Error("evidence.version mismatch");
      if (verdict.version !== 2) throw new Error("verdict.version mismatch");
      if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
      if (evidence.checks.ok.exitCode !== 0) throw new Error("expected exitCode 0");
      if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

      console.log("BUN_CONSUMER_ESM_OK");
    `
    writeFileSync(path.join(consumerDir, "run.mjs"), script)

    const result = spawnSync("bun", ["run.mjs"], { cwd: consumerDir, encoding: "utf8" })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("BUN_CONSUMER_ESM_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("requires defineRepoContract and runRepoContract via CommonJS (dist/index.cjs)", () => {
    const script = `
      const { defineRepoContract, runRepoContract } = require("repo-contract");

      const config = defineRepoContract({
        checks: {
          ok: {
            run: [process.execPath, "--version"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "exited 0" }
                : { outcome: "fail", rationale: "expected exit code 0" },
          },
        },
      });

      runRepoContract(config).then(({ evidence, verdict }) => {
        if (evidence.version !== 1) throw new Error("evidence.version mismatch");
        if (verdict.version !== 2) throw new Error("verdict.version mismatch");
        if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
        if (evidence.checks.ok.exitCode !== 0) throw new Error("expected exitCode 0");
        if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

        console.log("BUN_CONSUMER_CJS_OK");
      });
    `
    writeFileSync(path.join(consumerDir, "run.cjs"), script)

    const result = spawnSync("bun", ["run.cjs"], { cwd: consumerDir, encoding: "utf8" })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("BUN_CONSUMER_CJS_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("resolves the ./presets export and runs a real check built from a preset", () => {
    const script = `
      import { defineRepoContract, runRepoContract } from "repo-contract";
      import { format } from "repo-contract/presets";

      const config = defineRepoContract({
        checks: {
          ok: {
            ...format,
            run: [process.execPath, "--version"],
          },
        },
      });

      const { verdict } = await runRepoContract(config);

      if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
      if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

      console.log("BUN_CONSUMER_PRESETS_OK");
    `
    writeFileSync(path.join(consumerDir, "run-presets.mjs"), script)

    const result = spawnSync("bun", ["run-presets.mjs"], { cwd: consumerDir, encoding: "utf8" })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("BUN_CONSUMER_PRESETS_OK")
    expect(result.status).toBe(0)
  }, 20_000)
})
