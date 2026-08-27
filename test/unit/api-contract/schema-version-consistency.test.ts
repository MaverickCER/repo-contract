import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { normalizeApiPackage } from "../../../scripts/api-contract/model-normalizer.js"
import { detectSchemaVersionDrift } from "../../../scripts/api-contract/schema-version-consistency.js"
import { buildFixturePackage } from "../../helpers/api-contract/build-fixture-package.js"

/**
 * Real `Extractor.invoke()` over real baseline/current fixture package pairs -- the structural
 * detection (an exported interface with a literal-typed `version` member) is real behavior worth
 * proving against the actual model, not a synthetic-only guarantee.
 */

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-schema-version-consistency-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function normalize(sourceText: string, sub: string) {
  const fixture = await buildFixturePackage(path.join(root, sub), sourceText)
  return normalizeApiPackage(fixture.pkg, "public")
}

describe("detectSchemaVersionDrift", () => {
  it("does not flag an interface whose shape is unchanged", async () => {
    const source = `
/** @public */
export interface Evidence {
  readonly version: 1
  readonly startedAt: string
}
`
    const baseline = await normalize(source, "baseline")
    const current = await normalize(source, "current")
    expect(detectSchemaVersionDrift(baseline, current)).toEqual([])
  }, 30_000)

  it("flags an interface whose shape changed without its version literal being bumped", async () => {
    const baselineSource = `
/** @public */
export interface Evidence {
  readonly version: 1
  readonly startedAt: string
}
`
    const currentSource = `
/** @public */
export interface Evidence {
  readonly version: 1
  readonly startedAt: string
  readonly completedAt: string
}
`
    const baseline = await normalize(baselineSource, "baseline")
    const current = await normalize(currentSource, "current")
    const drift = detectSchemaVersionDrift(baseline, current)
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatchObject({
      kind: "schema-version-literal-stale",
      compatibility: "breaking",
    })
    expect(drift[0]?.explanation).toContain("Evidence")
    expect(drift[0]?.explanation).toContain("version")
  }, 30_000)

  it("does not flag an interface whose shape changed and whose version literal was correctly bumped", async () => {
    const baselineSource = `
/** @public */
export interface Evidence {
  readonly version: 1
  readonly startedAt: string
}
`
    const currentSource = `
/** @public */
export interface Evidence {
  readonly version: 2
  readonly startedAt: string
  readonly completedAt: string
}
`
    const baseline = await normalize(baselineSource, "baseline")
    const current = await normalize(currentSource, "current")
    expect(detectSchemaVersionDrift(baseline, current)).toEqual([])
  }, 30_000)

  it("never flags an interface with no literal-typed version member, regardless of shape changes", async () => {
    const baselineSource = `
/** @public */
export interface Config {
  readonly name: string
}
`
    const currentSource = `
/** @public */
export interface Config {
  readonly name: string
  readonly extra: number
}
`
    const baseline = await normalize(baselineSource, "baseline")
    const current = await normalize(currentSource, "current")
    expect(detectSchemaVersionDrift(baseline, current)).toEqual([])
  }, 30_000)
})
