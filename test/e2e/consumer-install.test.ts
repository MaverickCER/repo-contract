import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createConsumerFixture,
  distIsBuilt,
  removeConsumerFixture,
} from "../helpers/pack-consumer.js"

/**
 * Release-acceptance test, not a manual final check: proves the package works from a genuine
 * clean install under Node (correct `exports` map, correct `dist/` contents, no reliance on
 * repository-local paths), not just from `../../src`. See `test/helpers/pack-consumer.ts` for the
 * pack/install mechanics shared with the Bun/Deno counterparts of this suite.
 */
describe.skipIf(!distIsBuilt)("consumer install (packed tarball)", () => {
  let consumerDir: string

  beforeAll(() => {
    ;({ consumerDir } = createConsumerFixture("repo-contract-consumer-"))
  }, 120_000)

  afterAll(() => {
    removeConsumerFixture(consumerDir)
  })

  it("imports defineRepoContract and runRepoContract from the installed package", () => {
    const script = `
      import { defineRepoContract, runRepoContract } from "repo-contract";
      import { spawn } from "node:child_process";

      const config = defineRepoContract({
        checks: {
          ok: {
            run: [process.execPath, "-e", "process.exit(0)"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "exited 0" }
                : { outcome: "fail", rationale: "expected exit code 0" },
          },
        },
        spawn,
        env: process.env,
      });

      const { evidence, verdict } = await runRepoContract(config);

      if (evidence.version !== 1) throw new Error("evidence.version mismatch");
      if (verdict.version !== 2) throw new Error("verdict.version mismatch");
      if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
      if (evidence.checks.ok.exitCode !== 0) throw new Error("expected exitCode 0");
      if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

      console.log("CONSUMER_INSTALL_OK");
    `
    writeFileSync(path.join(consumerDir, "run.mjs"), script)

    const result = spawnSync(process.execPath, ["run.mjs"], {
      cwd: consumerDir,
      encoding: "utf8",
    })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("CONSUMER_INSTALL_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("requires defineRepoContract and runRepoContract via CommonJS (dist/index.cjs), not only ESM import", () => {
    // The consumer package.json declares "type": "module" (see beforeAll
    // above) -- a .cjs extension is what forces Node to resolve this script,
    // and therefore the package's own `require` condition (dist/index.cjs),
    // as CommonJS regardless. Closes the one real compatibility gap the
    // ESM-only test above leaves: the package ships both entry points (see
    // package.json's "exports" map), but only the ESM one was ever
    // exercised end-to-end.
    const script = `
      const { defineRepoContract, runRepoContract } = require("repo-contract");
      const { spawn } = require("node:child_process");

      const config = defineRepoContract({
        checks: {
          ok: {
            run: [process.execPath, "-e", "process.exit(0)"],
            policy: ({ result }) =>
              result.exitCode === 0
                ? { outcome: "pass", rationale: "exited 0" }
                : { outcome: "fail", rationale: "expected exit code 0" },
          },
        },
        spawn,
        env: process.env,
      });

      runRepoContract(config).then(({ evidence, verdict }) => {
        if (evidence.version !== 1) throw new Error("evidence.version mismatch");
        if (verdict.version !== 2) throw new Error("verdict.version mismatch");
        if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
        if (evidence.checks.ok.exitCode !== 0) throw new Error("expected exitCode 0");
        if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

        console.log("CONSUMER_INSTALL_CJS_OK");
      });
    `
    writeFileSync(path.join(consumerDir, "run.cjs"), script)

    const result = spawnSync(process.execPath, ["run.cjs"], {
      cwd: consumerDir,
      encoding: "utf8",
    })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("CONSUMER_INSTALL_CJS_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("resolves the ./presets export and runs a real check built from a preset (ESM)", () => {
    const script = `
      import { defineRepoContract, runRepoContract } from "repo-contract";
      import { format } from "repo-contract/presets";
      import { spawn } from "node:child_process";

      const config = defineRepoContract({
        checks: {
          // The documented import + spread + override pattern: use a real
          // preset's shape but replace \`run\` so this test doesn't depend
          // on prettier being installed in the consumer fixture.
          ok: {
            ...format,
            run: [process.execPath, "-e", "process.exit(0)"],
          },
        },
        spawn,
        env: process.env,
      });

      const { verdict } = await runRepoContract(config);

      if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
      if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

      console.log("CONSUMER_INSTALL_PRESETS_OK");
    `
    writeFileSync(path.join(consumerDir, "run-presets.mjs"), script)

    const result = spawnSync(process.execPath, ["run-presets.mjs"], {
      cwd: consumerDir,
      encoding: "utf8",
    })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("CONSUMER_INSTALL_PRESETS_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("requires the ./presets export via CommonJS (dist/presets.cjs), not only ESM import", () => {
    const script = `
      const { defineRepoContract, runRepoContract } = require("repo-contract");
      const { format } = require("repo-contract/presets");
      const { spawn } = require("node:child_process");

      const config = defineRepoContract({
        checks: {
          ok: {
            ...format,
            run: [process.execPath, "-e", "process.exit(0)"],
          },
        },
        spawn,
        env: process.env,
      });

      runRepoContract(config).then(({ verdict }) => {
        if (verdict.passed !== true) throw new Error("expected verdict.passed to be true");
        if (verdict.checks.ok.outcome !== "pass") throw new Error("expected check to pass");

        console.log("CONSUMER_INSTALL_PRESETS_CJS_OK");
      });
    `
    writeFileSync(path.join(consumerDir, "run-presets.cjs"), script)

    const result = spawnSync(process.execPath, ["run-presets.cjs"], {
      cwd: consumerDir,
      encoding: "utf8",
    })

    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("CONSUMER_INSTALL_PRESETS_CJS_OK")
    expect(result.status).toBe(0)
  }, 20_000)

  it("resolves the ./schema export to real, valid JSON Schema files", () => {
    // `node -e` defaults to CommonJS regardless of the target package's own
    // "type": "module" -- simplest, most portable way to resolve and read a
    // static JSON export without a loader.
    const resolveResult = spawnSync(
      process.execPath,
      [
        "-e",
        `
        const path = require.resolve("repo-contract/schema");
        const fs = require("fs");
        const schema = JSON.parse(fs.readFileSync(path, "utf8"));
        if (typeof schema.$schema !== "string") throw new Error("missing $schema");
        if (typeof schema.$id !== "string") throw new Error("missing $id");
        console.log("SCHEMA_OK");
        `,
      ],
      { cwd: consumerDir, encoding: "utf8" },
    )

    expect(resolveResult.stderr).toBe("")
    expect(resolveResult.stdout).toContain("SCHEMA_OK")
    expect(resolveResult.status).toBe(0)
  }, 20_000)
})
