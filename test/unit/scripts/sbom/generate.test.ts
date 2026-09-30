import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as SpawnModule from "../../../../scripts/sbom/spawn.js"

const { mkdir, readFile } = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}))
vi.mock("node:fs/promises", () => ({ mkdir, readFile }))

const { runCycloneDxNpm } = vi.hoisted(() => ({
  runCycloneDxNpm: vi.fn<typeof SpawnModule.runCycloneDxNpm>(),
}))
vi.mock("../../../../scripts/sbom/spawn.js", () => ({ runCycloneDxNpm }))

const { generateSbom } = await import("../../../../scripts/sbom/generate.js")

const VALID_DOCUMENT = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: [{ type: "library", name: "left-pad" }],
  metadata: {
    tools: {
      components: [
        { type: "application", group: "@cyclonedx", name: "cyclonedx-npm", version: "6.0.1" },
      ],
    },
  },
}

describe("generateSbom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdir.mockResolvedValue(undefined)
  })

  it("ensures docs/ exists before spawning cyclonedx-npm", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    await generateSbom("/repo")

    expect(mkdir).toHaveBeenCalledWith(path.join("/repo", "docs"), { recursive: true })
    const mkdirOrder = mkdir.mock.invocationCallOrder[0]
    const spawnOrder = runCycloneDxNpm.mock.invocationCallOrder[0]
    expect(mkdirOrder).toBeDefined()
    expect(spawnOrder).toBeDefined()
    expect(mkdirOrder).toBeLessThan(spawnOrder!)
  })

  it("returns the spawn failure's own message verbatim when cyclonedx-npm fails, without reading anything back", async () => {
    runCycloneDxNpm.mockReturnValue({
      ok: false,
      reason: "cli-not-installed",
      message: "The `cyclonedx-npm` CLI is not installed.",
    })

    const evidence = await generateSbom("/repo")

    expect(evidence).toEqual({ ok: false, reason: "The `cyclonedx-npm` CLI is not installed." })
    expect(readFile).not.toHaveBeenCalled()
  })

  it("fails with a clear reason when the file cyclonedx-npm just wrote cannot be read back", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockRejectedValue(new Error("ENOENT: no such file"))

    const evidence = await generateSbom("/repo")

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) {
      expect(evidence.reason).toContain("docs/sbom.cdx.json could not be read back")
      expect(evidence.reason).toContain("ENOENT: no such file")
    }
  })

  it("fails when the written file is not valid JSON", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue("{not json")

    const evidence = await generateSbom("/repo")

    expect(evidence).toEqual({ ok: false, reason: "docs/sbom.cdx.json is not valid JSON." })
  })

  it("fails, surfacing validateSbomDocument's own rejection reason, when the written file is malformed CycloneDX", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify({ bomFormat: "SPDX" }))

    const evidence = await generateSbom("/repo")

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) expect(evidence.reason).toContain('"bomFormat"')
  })

  it("succeeds, reading docs/sbom.cdx.json back from the given root and reporting its validated summary", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    const evidence = await generateSbom("/repo")

    expect(readFile).toHaveBeenCalledWith(path.join("/repo", "docs/sbom.cdx.json"), "utf8")
    expect(evidence).toEqual({
      ok: true,
      outputPath: "docs/sbom.cdx.json",
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      componentCount: 1,
      toolVersion: "6.0.1",
    })
  })

  it("passes the real root through to runCycloneDxNpm unchanged", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    await generateSbom("/some/other/root")

    expect(runCycloneDxNpm).toHaveBeenCalledWith("/some/other/root")
  })
})
