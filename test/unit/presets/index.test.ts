import { describe, expect, it } from "vitest"
import { defineRepoContract, runRepoContract } from "../../../src/index.js"
import * as presets from "../../../src/presets/index.js"
import type { CheckDefinitionConfig, CheckStatus, PolicyResult } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "./fixtures.js"

/**
 * A smoke test of the presets barrel itself -- every other test file in
 * test/unit/presets/ imports directly from an individual preset module for
 * precision, but nothing else exercises src/presets/index.ts's actual
 * re-exports.
 */
describe("presets barrel (src/presets/index.ts)", () => {
  const plainObjectPresets: Record<string, CheckDefinitionConfig> = {
    format: presets.format,
    typecheck: presets.typecheck,
    test: presets.test,
    e2e: presets.e2e,
    securityDeps: presets.securityDeps,
    securitySecrets: presets.securitySecrets,
    license: presets.license,
    publint: presets.publint,
    arethetypeswrong: presets.arethetypeswrong,
  }

  const factoryPresets: Record<string, () => CheckDefinitionConfig> = {
    lint: () => presets.lint(),
    deadCode: () => presets.deadCode(),
    duplication: () => presets.duplication(),
    stylelint: () => presets.stylelint(),
    markdownlint: () => presets.markdownlint(),
    brokenLinks: () => presets.brokenLinks(),
    commitlint: () => presets.commitlint(),
  }

  it("exports exactly the documented preset names", () => {
    const names = Object.keys({ ...plainObjectPresets, ...factoryPresets }).sort()
    expect(Object.keys(presets).sort()).toEqual(names)
  })

  it("exports every plain-object preset as a { run, policy } shape", () => {
    for (const [name, preset] of Object.entries(plainObjectPresets)) {
      expect(typeof preset.run === "string" || Array.isArray(preset.run), name).toBe(true)
      expect(typeof preset.policy, name).toBe("function")
    }
  })

  it("exports every factory preset as a function returning a { run, policy } shape when called with defaults", () => {
    for (const [name, factory] of Object.entries(factoryPresets)) {
      const preset = factory()
      expect(typeof preset.run === "string" || Array.isArray(preset.run), name).toBe(true)
      expect(typeof preset.policy, name).toBe("function")
    }
  })

  it("does not export internal shared helpers", () => {
    expect("checkDependencyInstalled" in presets).toBe(false)
    expect("evaluateVitestJsonPolicy" in presets).toBe(false)
  })

  it("supports the import + spread + override pattern end to end through defineRepoContract/runRepoContract", async () => {
    const config = defineRepoContract({
      checks: {
        // Spread a preset and override `run` (the documented escape hatch)
        // and `policy` -- exactly the pattern the README documents.
        ok: {
          ...presets.format,
          run: [process.execPath, "-e", "process.exit(0)"],
          policy: ({ result }) =>
            result.exitCode === 0
              ? { outcome: "pass", rationale: "overridden policy: exited 0" }
              : { outcome: "fail", rationale: "overridden policy: expected exit 0" },
        },
      },
    })

    const { verdict } = await runRepoContract(config)

    expect(verdict.passed).toBe(true)
    expect(verdict.checks.ok).toEqual({ outcome: "pass", rationale: "overridden policy: exited 0" })
  })

  it.each([
    ["format", presets.format, "prettier"],
    ["typecheck", presets.typecheck, "typescript"],
    ["lint", presets.lint(), "eslint"],
    ["test", presets.test, "vitest"],
    ["e2e", presets.e2e, "@playwright/test"],
    ["license", presets.license, "licensee"],
    ["publint", presets.publint, "publint"],
    ["arethetypeswrong", presets.arethetypeswrong, "@arethetypeswrong/cli"],
    ["deadCode", presets.deadCode(), "knip"],
    ["duplication", presets.duplication(), "jscpd"],
    ["stylelint", presets.stylelint(), "stylelint"],
    ["markdownlint", presets.markdownlint(), "markdownlint-cli2"],
    ["brokenLinks", presets.brokenLinks(), "linkinator"],
    ["commitlint", presets.commitlint(), "@commitlint/cli"],
    ["securitySecrets", presets.securitySecrets, "secretlint"],
  ] as const)(
    "%s reports an actionable missing-dependency failure through a real ENOENT spawn, not just fabricated evidence",
    async (_name, preset, packageName) => {
      const config = defineRepoContract({
        checks: {
          missing: { ...preset, run: ["definitely-not-a-real-binary-repo-contract-preset-test"] },
        },
      })

      const { verdict } = await runRepoContract(config)

      expect(verdict.passed).toBe(false)
      expect(verdict.checks.missing.outcome).toBe("fail")
      expect(verdict.checks.missing.rationale).toContain(`\`${packageName}\``)
    },
  )

  // --- Robustness: no preset policy may ever throw ---
  //
  // A policy that throws is rethrown by run-policies.ts as `PolicyThrewError`
  // and rejects the whole `runRepoContract()` promise -- one preset choking on
  // an unexpected tool-output shape (or an abnormal process termination) takes
  // the entire contract run down with it. Every preset must instead classify
  // that as a clean `fail` verdict. These tables drive both checks over every
  // preset the barrel exports, so a new preset is covered the moment it is
  // added to the maps above.
  const ALL_PRESETS: readonly { name: string; config: CheckDefinitionConfig }[] = [
    ...Object.entries(plainObjectPresets).map(([name, config]) => ({ name, config })),
    ...Object.entries(factoryPresets).map(([name, factory]) => ({ name, config: factory() })),
  ]

  function expectWellFormedFail(result: PolicyResult): void {
    expect(["pass", "warn", "fail"]).toContain(result.outcome)
    expect(typeof result.rationale).toBe("string")
    expect(result.rationale.length).toBeGreaterThan(0)
  }

  const ABNORMAL_STATUSES: readonly CheckStatus[] = [
    "timed_out",
    "aborted",
    "host_terminated",
    "signaled",
    "spawn_error",
  ]

  describe.each(ALL_PRESETS)("$name preset -- abnormal process termination", ({ config }) => {
    it.each(ABNORMAL_STATUSES)(
      "reports %s as a termination failure, never a fabricated tool verdict or a throw",
      async (status) => {
        const result = await config.policy(
          fakeContext(
            fakeCheckEvidence({ status, exitCode: null, signal: null, stdout: "", stderr: "" }),
          ),
        )
        expect(result.outcome).toBe("fail")
        // The rationale must name the termination cause, not interpret absent
        // output as a tool verdict ("could not be parsed as JSON", etc.).
        expect(result.rationale).toMatch(/did not finish|was terminated|could not be started/i)
      },
    )
  })

  const ADVERSARIAL_JSON: readonly { label: string; value: unknown }[] = [
    { label: "null", value: null },
    { label: "a number", value: 42 },
    { label: "a string", value: "unexpected" },
    { label: "a boolean", value: true },
    { label: "an empty array", value: [] },
    { label: "an array containing null", value: [null] },
    { label: "an array of empty objects", value: [{}] },
    { label: "an empty object", value: {} },
    { label: "an object with unexpected keys", value: { totally: "different" } },
  ]

  const JSON_OUTPUT_PRESETS = ALL_PRESETS.filter(({ config }) => config.output?.format === "json")

  describe.each(JSON_OUTPUT_PRESETS)("$name preset -- adversarial parsed output", ({ config }) => {
    it.each(ADVERSARIAL_JSON)(
      "returns a well-formed PolicyResult (never throws) when output.value is $label",
      async ({ value }) => {
        const result = await config.policy(
          fakeContext(
            fakeCheckEvidence({
              exitCode: 0,
              output: { format: "json", success: true, value },
            }),
          ),
        )
        expectWellFormedFail(result)
      },
    )

    it("fails cleanly (never throws) when the requested parse itself failed", async () => {
      const result = await config.policy(
        fakeContext(
          fakeCheckEvidence({
            exitCode: 1,
            output: { format: "json", success: false, error: "Unexpected end of JSON input" },
          }),
        ),
      )
      expect(result.outcome).toBe("fail")
    })

    it("fails cleanly (never throws) when output is absent despite requesting a format", async () => {
      const result = await config.policy(
        fakeContext(fakeCheckEvidence({ exitCode: 0, output: undefined })),
      )
      expect(result.outcome).toBe("fail")
    })
  })

  it("securityDeps has no missing-dependency check -- it shells out to npm itself, which cannot be missing in this environment", async () => {
    const config = defineRepoContract({
      checks: {
        missing: {
          ...presets.securityDeps,
          run: ["definitely-not-a-real-binary-repo-contract-preset-test"],
        },
      },
    })

    const { verdict } = await runRepoContract(config)

    expect(verdict.passed).toBe(false)
    // Falls through to the generic "no vulnerability summary" fail, not an
    // "is required by this preset" message -- there's no package name to
    // report installing since `npm` itself is what's assumed present.
    expect(verdict.checks.missing.rationale).not.toContain("is required by this preset")
  })
})
