import { describe, expect, it } from "vitest"
import { validateRepoContractConfig } from "../../../src/config/validate-config.js"
import { defineRepoContract } from "../../../src/index.js"
import { COVERAGE_VITEST_ARGS } from "../../../src/presets/coverage.js"
import { test as testPreset } from "../../../src/presets/test.js"
import { TIER_NAMES } from "../../../src/tiers/catalog.js"
import { strict, tier } from "../../../src/tiers/tiers.js"
import { testEnv } from "../../helpers/test-env.js"
import { testSpawn } from "../../helpers/test-spawn.js"

// The same tiers as tiers.test.ts, built from the real presets rather than fakes.
describe("R1 tiers built from the real presets", () => {
  it("the result spreads into defineRepoContract and validateRepoContractConfig accepts it", () => {
    const config = defineRepoContract({
      spawn: testSpawn,
      env: testEnv,
      ...strict({ Coverage: { thresholds: { branches: 70 } }, Commits: false }),
    })
    expect(() => {
      validateRepoContractConfig(config)
    }).not.toThrow()
    expect((config as { tier?: { name: string } }).tier?.name).toBe("strict")
  })

  it("validates every tier with no overrides and with every check turned off", () => {
    for (const name of TIER_NAMES) {
      const plain = tier(name)
      const off = tier(name, Object.fromEntries(plain.tier.checks.map((id) => [id, false])))
      for (const built of [plain, off]) {
        expect(() => {
          validateRepoContractConfig({ spawn: testSpawn, env: testEnv, ...built })
        }, name).not.toThrow()
      }
    }
  })

  it("passes a bad preset option through, so it throws when the config loads", () => {
    expect(() => strict({ Coverage: { thresholds: { lines: 101 } } })).toThrow(RangeError)
    expect(() => strict({ Crap: { threshold: -1 } })).toThrow(RangeError)
    expect(() => tier("app", { Build: { script: "" } })).toThrow(RangeError)
  })

  it("appends the real COVERAGE_VITEST_ARGS to the Tests run", () => {
    expect(strict().checks.Tests.run).toEqual([
      ...(testPreset.run as readonly string[]),
      ...COVERAGE_VITEST_ARGS,
    ])
  })
})
