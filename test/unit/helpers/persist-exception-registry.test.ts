import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  exceptionRegistryStandardSchema,
  loadAndReconcileExceptionRegistry,
  reconcileAndPersistExceptionRegistry,
  serializeExceptionRegistry,
} from "../../../src/helpers/index.js"
import type { ExceptionRegistrySchema } from "../../../src/helpers/index.js"

interface ToyFinding {
  readonly id: string
}
interface ToyRecord {
  readonly id: string
  readonly version: 1 | 2
  readonly justification: string
}

const schema: ExceptionRegistrySchema<ToyRecord> = {
  namespace: "toy:",
  metadataKeys: [],
  validateRecord: (core) => ({ id: core.id, version: 1, justification: core.justification }),
}
const standard = exceptionRegistryStandardSchema(schema)
const stub = (_finding: ToyFinding, id: string): ToyRecord => ({
  id,
  version: 1,
  justification: "",
})

let dir: string
let registry: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "repo-contract-persist-exception-"))
  registry = path.join(dir, "exceptions", "toy.json")
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("reconcileAndPersistExceptionRegistry", () => {
  it("reconcileAndPersistExceptionRegistry writes a stub for each new finding", async () => {
    const kept = { id: "toy:a", version: 1, justification: "reviewed" } as const
    const result = await reconcileAndPersistExceptionRegistry(
      registry,
      "exceptions/toy.json",
      [kept],
      [{ id: "toy:a" }, { id: "toy:b" }],
      stub,
    )
    const fresh = { id: "toy:b", version: 1, justification: "" }
    expect(result).toEqual({
      ok: true,
      registry: { activeRecords: [kept, fresh], staleRecords: [], newStubIds: ["toy:b"] },
    })
    expect(await readFile(registry, "utf8")).toBe(serializeExceptionRegistry([kept, fresh]))
  })

  it("reconcileAndPersistExceptionRegistry keeps a stale record and reports it", async () => {
    const gone = { id: "toy:gone", version: 1, justification: "old" } as const
    const result = await reconcileAndPersistExceptionRegistry(
      registry,
      "exceptions/toy.json",
      [gone],
      [],
      stub,
    )
    expect(result).toEqual({
      ok: true,
      registry: { activeRecords: [], staleRecords: [gone], newStubIds: [] },
    })
    expect(await readFile(registry, "utf8")).toBe(serializeExceptionRegistry([gone]))
  })

  it("reconcileAndPersistExceptionRegistry creates the registry directory when missing", async () => {
    const deep = path.join(dir, "a", "b", "toy.json")
    const result = await reconcileAndPersistExceptionRegistry(deep, "a/b/toy.json", [], [], stub)
    expect(result.ok).toBe(true)
    expect(await readFile(deep, "utf8")).toBe(serializeExceptionRegistry([]))
  })

  it("reconcileAndPersistExceptionRegistry fails with the relative path when the write fails", async () => {
    // A directory where the file should be makes the read fail with EISDIR.
    await mkdir(registry, { recursive: true })
    const result = await reconcileAndPersistExceptionRegistry(
      registry,
      "exceptions/toy.json",
      [],
      [],
      stub,
    )
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.rationale).toMatch(/^Writing exceptions\/toy\.json failed: /)
  })

  it("fails with the relative path when the directory cannot be created", async () => {
    await writeFile(path.join(dir, "exceptions"), "a file, not a directory")
    const result = await reconcileAndPersistExceptionRegistry(
      registry,
      "exceptions/toy.json",
      [],
      [],
      stub,
    )
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.rationale).toMatch(/^Could not write exceptions\/toy\.json: /)
  })

  it("fails without writing when reconciliation fails", async () => {
    const result = await reconcileAndPersistExceptionRegistry(
      registry,
      "exceptions/toy.json",
      [],
      [{ id: "toy:a" }, { id: "toy:a" }],
      stub,
    )
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.rationale).toMatch(
      /^exceptions\/toy\.json could not be reconciled: /,
    )
    await expect(readFile(registry, "utf8")).rejects.toThrow(/ENOENT/)
  })
})

describe("loadAndReconcileExceptionRegistry", () => {
  it("loadAndReconcileExceptionRegistry leaves an invalid registry unchanged and lists every error", async () => {
    await mkdir(path.dirname(registry), { recursive: true })
    const text = JSON.stringify({
      exceptions: [
        { id: "other:a", version: 1, justification: "" },
        { id: "toy:b", version: 5, justification: "" },
      ],
    })
    await writeFile(registry, text)
    const result = await loadAndReconcileExceptionRegistry(
      registry,
      "exceptions/toy.json",
      standard,
      [{ id: "toy:c" }],
      stub,
    )
    expect(result).toEqual({
      ok: false,
      rationale: [
        "exceptions/toy.json failed to load and was left unchanged:",
        '- exceptions[0].id must be a non-empty string beginning with "toy:" (got "other:a").',
        "- exceptions[1].version must be the number 2 (or the legacy 1) (got 5).",
      ].join("\n"),
    })
    expect(await readFile(registry, "utf8")).toBe(text)
  })

  it("loadAndReconcileExceptionRegistry treats a missing file as an empty registry", async () => {
    const result = await loadAndReconcileExceptionRegistry(
      registry,
      "exceptions/toy.json",
      standard,
      [{ id: "toy:a" }],
      stub,
    )
    expect(result).toEqual({
      ok: true,
      registry: {
        activeRecords: [{ id: "toy:a", version: 1, justification: "" }],
        staleRecords: [],
        newStubIds: ["toy:a"],
      },
    })
  })

  it("reconciles against the records already on disk", async () => {
    await mkdir(path.dirname(registry), { recursive: true })
    const kept = { id: "toy:a", version: 1, justification: "reviewed" }
    await writeFile(registry, serializeExceptionRegistry([kept]))
    const result = await loadAndReconcileExceptionRegistry(
      registry,
      "exceptions/toy.json",
      standard,
      [{ id: "toy:a" }],
      stub,
    )
    expect(result).toEqual({
      ok: true,
      registry: { activeRecords: [kept], staleRecords: [], newStubIds: [] },
    })
  })
})
