import { describe, expect, it } from "vitest"
import { parseAffectedConfig, readContractConfig } from "../../../src/affected/index.js"

const block = { ignore: ["docs/**"], links: [{ when: "fixtures/**", run: ["test/golden/**"] }] }
const legacy = { triggers: ["config/**"] }

describe("readContractConfig", () => {
  it("reads contract.affected through parseAffectedConfig, source contract", () => {
    const parsed = parseAffectedConfig(block)
    expect(parsed).toHaveProperty("options")
    expect(readContractConfig({ name: "x", contract: { affected: block } })).toEqual({
      config: { affected: "options" in parsed ? parsed.options : {}, source: "contract" },
    })
  })

  it("falls back to repo-contract.affected, source repo-contract", () => {
    expect(readContractConfig({ "repo-contract": { affected: legacy } })).toEqual({
      config: { affected: legacy, source: "repo-contract" },
    })
  })

  it("falls back to repo-contract.affected when contract holds only other tools' keys", () => {
    expect(
      readContractConfig({ contract: { copies: [] }, "repo-contract": { affected: legacy } }),
    ).toEqual({ config: { affected: legacy, source: "repo-contract" } })
  })

  it.each([
    ["no manifest", undefined],
    ["an empty manifest", {}],
    ["a manifest without either key", { name: "x", version: "1.0.0" }],
    ["a contract key without affected", { contract: {} }],
    ["a repo-contract key without affected", { "repo-contract": {} }],
  ])("returns empty options and source none for %s", (_name, manifest) => {
    expect(readContractConfig(manifest)).toEqual({ config: { affected: {}, source: "none" } })
  })

  it("lets contract.affected win when repo-contract.affected is also present", () => {
    expect(
      readContractConfig({ contract: { affected: block }, "repo-contract": { affected: legacy } }),
    ).toEqual({ config: { affected: block, source: "contract" } })
  })

  it("ignores an invalid legacy block when contract.affected is present", () => {
    expect(
      readContractConfig({
        contract: { affected: block },
        "repo-contract": { affected: { ignroe: [] } },
      }),
    ).toEqual({ config: { affected: block, source: "contract" } })
  })

  it("ignores other keys under contract, which belong to other tools", () => {
    const manifest = {
      contract: { affected: legacy, copies: ["x"], checks: { Size: false }, anything: 1 },
    }
    expect(readContractConfig(manifest)).toEqual({
      config: { affected: legacy, source: "contract" },
    })
  })

  it("passes a parseAffectedConfig error through with its key path", () => {
    const detail =
      "unknown key 'ignroe' (expected one of: ignore, triggers, tests, notMutated, links)"
    expect(readContractConfig({ contract: { affected: { ignroe: [] } } })).toEqual({
      error: `invalid configuration in package.json (contract.affected): ${detail}`,
    })
    expect(readContractConfig({ "repo-contract": { affected: { ignroe: [] } } })).toEqual({
      error: `invalid configuration in package.json (repo-contract.affected): ${detail}`,
    })
    expect(readContractConfig({ contract: { affected: "docs/**" } })).toEqual({
      error: "invalid configuration in package.json (contract.affected): must be an object",
    })
  })

  it.each([
    ["a string", "strict"],
    ["a list", []],
    ["null", null],
    ["a number", 1],
  ])("ignores a contract key that is %s, which another tool owns", (_name, contract) => {
    expect(readContractConfig({ contract })).toEqual({ config: { affected: {}, source: "none" } })
    expect(readContractConfig({ contract, "repo-contract": { affected: legacy } })).toEqual({
      config: { affected: legacy, source: "repo-contract" },
    })
  })

  it.each([
    ["a string", "x"],
    ["a list", []],
    ["null", null],
  ])("keeps reading a repo-contract key that is %s as no settings, as before", (_name, value) => {
    expect(readContractConfig({ "repo-contract": value })).toEqual({
      config: { affected: {}, source: "none" },
    })
  })

  it.each([
    ["a list", []],
    ["null", null],
    ["a string", "x"],
  ])("fails when the manifest is %s", (_name, manifest) => {
    expect(readContractConfig(manifest)).toEqual({
      error: "invalid configuration in package.json: the file must hold a JSON object",
    })
  })

  it("does not read affected settings from the manifest's prototype", () => {
    const manifest = Object.create({ contract: { affected: block } }) as object
    expect(readContractConfig(manifest)).toEqual({ config: { affected: {}, source: "none" } })
  })
})
