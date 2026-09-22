import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadShippedPackageVersions } from "../../../scripts/security-socket/scan.js"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-security-socket-scan-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeLock(packages: Record<string, unknown>): Promise<void> {
  await writeFile(
    path.join(root, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages }),
    "utf8",
  )
}

describe("loadShippedPackageVersions", () => {
  it("includes a package with no dev/peer/optional flag at all", async () => {
    await writeLock({ "node_modules/minimatch": { version: "10.2.6" } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["minimatch@10.2.6"]))
  })

  it("excludes a devDependencies-only package", async () => {
    await writeLock({ "node_modules/yaml": { version: "2.9.0", dev: true } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("includes a peerDependencies-only package -- declaring a peer range is itself a shipped supply-chain choice, unlike a devDependency", async () => {
    await writeLock({ "node_modules/eslint": { version: "10.9.0", peer: true } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["eslint@10.9.0"]))
  })

  it("includes a strictly-optional package (a real optionalDependencies edge, still installed for a consumer)", async () => {
    await writeLock({ "node_modules/fsevents": { version: "2.3.3", optional: true } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["fsevents@2.3.3"]))
  })

  it("includes a devOptional package (per npm's own docs: dev AND optional-of-a-non-dev-dependency, so a real non-dev path still reaches it)", async () => {
    await writeLock({ "node_modules/both-paths": { version: "1.0.0", devOptional: true } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["both-paths@1.0.0"]))
  })

  it("excludes a package that is both dev and optional (an optionalDependency of a devDependency, no non-dev path at all)", async () => {
    await writeLock({
      "node_modules/dev-only-optional": { version: "1.0.0", dev: true, optional: true },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("counts a package as shipped if ANY of its resolved paths is a real production edge", async () => {
    await writeLock({
      "node_modules/shared-dep": { version: "1.0.0", dev: true },
      "node_modules/prod-dep/node_modules/shared-dep": { version: "1.0.0" },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["shared-dep@1.0.0"]))
  })

  it("resolves a scoped package name from its nested node_modules path", async () => {
    await writeLock({ "node_modules/@scope/pkg": { version: "3.1.0" } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["@scope/pkg@3.1.0"]))
  })

  it('skips the root package\'s own entry (key "")', async () => {
    await writeLock({ "": { name: "repo-contract", version: "0.6.0" } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("fails closed (returns undefined) on a dependency entry with a missing version", async () => {
    await writeLock({ "node_modules/no-version": {} })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("fails closed (returns undefined) on a dependency entry with an empty-string version", async () => {
    await writeLock({ "node_modules/empty-version": { version: "" } })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("fails closed (returns undefined) on a dependency entry whose value isn't a plain object", async () => {
    await writeLock({ "node_modules/broken": "not an object" })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("does NOT fail closed on a dev entry with a missing or malformed version -- it was never going to count as shipped", async () => {
    await writeLock({ "node_modules/dev-no-version": { dev: true } })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("fails closed (returns undefined) on a peer entry with a malformed version -- peer entries are shipped, so their version must be valid", async () => {
    await writeLock({ "node_modules/peer-bad-version": { peer: true, version: 42 } })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("resolves an npm workspace/file: link entry to its target's real version (a production workspace dependency)", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "packages/foo", link: true },
      "packages/foo": { version: "1.0.0" },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["foo@1.0.0"]))
  })

  it("excludes a link entry whose resolved target is dev-only", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "packages/foo", link: true },
      "packages/foo": { version: "1.0.0", dev: true },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("includes a link entry whose resolved target is peer-only", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "packages/foo", link: true },
      "packages/foo": { version: "1.0.0", peer: true },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set(["foo@1.0.0"]))
  })

  it("excludes a link entry that is itself marked dev without needing to resolve it", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "does/not/exist", link: true, dev: true },
    })
    const shipped = await loadShippedPackageVersions(root)
    expect(shipped).toEqual(new Set())
  })

  it("fails closed (returns undefined) on a link entry with a missing or empty resolved field", async () => {
    await writeLock({ "node_modules/foo": { link: true } })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("fails closed (returns undefined) on a link entry whose resolved target doesn't exist", async () => {
    await writeLock({ "node_modules/foo": { resolved: "packages/missing", link: true } })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("fails closed (returns undefined) on a link entry whose resolved target isn't a plain object", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "packages/foo", link: true },
      "packages/foo": "not an object",
    })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("fails closed (returns undefined) on a link entry whose resolved target has a missing version", async () => {
    await writeLock({
      "node_modules/foo": { resolved: "packages/foo", link: true },
      "packages/foo": {},
    })
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("returns undefined when package-lock.json is missing", async () => {
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("returns undefined when package-lock.json is not valid JSON", async () => {
    await writeFile(path.join(root, "package-lock.json"), "{ not json", "utf8")
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("returns undefined when the parsed JSON has no packages object", async () => {
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3 }),
      "utf8",
    )
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })

  it("returns undefined when the parsed JSON's top level isn't a plain object", async () => {
    await writeFile(path.join(root, "package-lock.json"), JSON.stringify([1, 2, 3]), "utf8")
    expect(await loadShippedPackageVersions(root)).toBeUndefined()
  })
})
