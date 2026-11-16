import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Ajv } from "ajv"
import addFormats from "ajv-formats"
import addDraft2019Formats from "ajv-formats-draft2019"
import { afterAll, describe, expect, it } from "vitest"
import { sbom } from "../../../src/presets/sbom.js"
import type { SbomOptions } from "../../../src/presets/sbom.js"
import type { CheckEvidence } from "../../../src/types.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "./fixtures.js"

function reportEvidence(report: unknown): CheckEvidence {
  return fakeCheckEvidence({ output: { format: "json", success: true, value: report } })
}

const doc = (file: string, status: string, components: number) => ({ file, status, components })

describe("sbom preset: run", () => {
  it("runs the generator with node over the default lockfile and outputs, in check mode", () => {
    const [command, flag, source, ...args] = sbom().run as readonly string[]
    expect([command, flag, typeof source]).toEqual(["node", "-e", "string"])
    expect(args).toEqual([
      "package-lock.json",
      "docs/sbom.cdx.json",
      "docs/sbom.production.cdx.json",
      "check",
    ])
    expect(sbom().output).toEqual({ format: "json" })
  })

  it("passes custom paths, an empty production path for null, and write mode", () => {
    const run = sbom({
      lockfile: "lock.json",
      output: "out/full.json",
      productionOutput: null,
      write: true,
    }).run as readonly string[]
    expect(run.slice(3)).toEqual(["lock.json", "out/full.json", "", "write"])
    expect((sbom({ productionOutput: "p.json" }).run as readonly string[])[5]).toBe("p.json")
  })
})

describe("sbom preset: policy", () => {
  it("fails when node cannot be spawned", async () => {
    const result = await sbom().policy(fakeContext(enoentEvidence("node")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("The SBOM generator")
  })

  it("fails when the output is not JSON", async () => {
    const result = await sbom().policy(
      fakeContext(
        fakeCheckEvidence({
          output: { format: "json", success: false, error: "Unexpected token" },
        }),
      ),
    )
    expect(result).toStrictEqual({
      outcome: "fail",
      rationale: "The SBOM generator output could not be parsed as JSON.",
    })
  })

  it("fails when there is no parsed output at all", async () => {
    const result = await sbom().policy(fakeContext(fakeCheckEvidence()))
    expect(result.rationale).toBe("The SBOM generator output could not be parsed as JSON.")
  })

  it.each([
    ["null", null],
    ["a string", "ok"],
    ["ok missing", { documents: [] }],
    ["ok false without an error", { ok: false }],
    ["ok false with a numeric error", { ok: false, error: 1 }],
    ["ok true without documents", { ok: true }],
    ["documents not an array", { ok: true, documents: {} }],
    ["a null document", { ok: true, documents: [null] }],
    ["a string document", { ok: true, documents: ["current"] }],
    ["one good document and one null", { ok: true, documents: [doc("f", "current", 1), null] }],
    [
      "a status that is not a string",
      { ok: true, documents: [{ file: "f", status: ["current"], components: 1 }] },
    ],
    ["undefined", undefined],
    ["a number", 7],
    ["a document without a file", { ok: true, documents: [{ status: "current", components: 1 }] }],
    ["a numeric status", { ok: true, documents: [{ file: "f", status: 1, components: 1 }] }],
    ["an unknown status", { ok: true, documents: [doc("f", "fresh", 1)] }],
    [
      "a string count",
      { ok: true, documents: [{ file: "f", status: "current", components: "1" }] },
    ],
  ])("fails on malformed report data: %s", async (_label, report) => {
    const result = await sbom().policy(fakeContext(reportEvidence(report)))
    expect(result).toStrictEqual({
      outcome: "fail",
      rationale: "The SBOM generator produced invalid JSON report data.",
    })
  })

  it("fails with the generator's own error", async () => {
    const result = await sbom().policy(
      fakeContext(reportEvidence({ ok: false, error: "Cannot read the lockfile." })),
    )
    expect(result).toStrictEqual({ outcome: "fail", rationale: "Cannot read the lockfile." })
  })

  it("passes when every document is current", async () => {
    const result = await sbom().policy(
      fakeContext(
        reportEvidence({
          ok: true,
          documents: [doc("docs/sbom.cdx.json", "current", 12), doc("p.json", "current", 3)],
        }),
      ),
    )
    expect(result).toStrictEqual({
      outcome: "pass",
      rationale:
        "CycloneDX 1.6 SBOM(s) match package-lock.json:\n- docs/sbom.cdx.json: current (12 components)\n- p.json: current (3 components)",
    })
  })

  it.each(["stale", "missing", "invalid"])(
    "fails when a document is %s, naming the default fix",
    async (status) => {
      const result = await sbom({ lockfile: "l.json" }).policy(
        fakeContext(
          reportEvidence({
            ok: true,
            documents: [doc("a.json", "current", 2), doc("b.json", status, 1)],
          }),
        ),
      )
      expect(result).toStrictEqual({
        outcome: "fail",
        rationale: `SBOM(s) out of date with l.json:\n- a.json: current (2 components)\n- b.json: ${status} (1 components)\nRegenerate them with this preset in write mode (sbom({ write: true })).`,
      })
    },
  )

  it("names the configured fix command on failure", async () => {
    const result = await sbom({ fix: "npm run sbom" }).policy(
      fakeContext(reportEvidence({ ok: true, documents: [doc("a.json", "stale", 2)] })),
    )
    expect(result.rationale).toBe(
      "SBOM(s) out of date with package-lock.json:\n- a.json: stale (2 components)\nRegenerate them: npm run sbom",
    )
  })

  it("passes in write mode, listing what it wrote", async () => {
    const result = await sbom({ write: true }).policy(
      fakeContext(reportEvidence({ ok: true, documents: [doc("a.json", "written", 4)] })),
    )
    expect(result).toStrictEqual({
      outcome: "pass",
      rationale:
        "Wrote CycloneDX 1.6 SBOM(s) from package-lock.json:\n- a.json: written (4 components)",
    })
  })
})

// ---------------------------------------------------------------------------------------------
// The generator itself, run with node in a temporary directory.

const bytes = (length: number, fill: number) => Buffer.alloc(length, fill)
const b64 = (buffer: Buffer) => buffer.toString("base64")
const hex = (buffer: Buffer) => buffer.toString("hex")

const SHA512 = bytes(64, 1)
const SHA1 = bytes(20, 2)
const SHA256 = bytes(32, 3)
const SHA384 = bytes(48, 4)
const OTHER_SHA512 = bytes(64, 5)

const LOCK = {
  name: "fixture-app",
  version: "1.2.3",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": {
      name: "fixture-app",
      version: "1.2.3",
      license: "MIT",
      workspaces: ["packages/w"],
      dependencies: { "@s/a": "^1.0.0", d: "^2.0.0", alias: "npm:real@^1.0.0", w: "*" },
      optionalDependencies: { c: "^1.0.0" },
      devDependencies: { b: "^1.0.0" },
      peerDependencies: { p: "^1.0.0", "not-installed": "^1.0.0" },
    },
    "node_modules/@s/a": {
      version: "1.0.0",
      resolved: "https://registry.example.test/@s/a/-/a-1.0.0.tgz",
      integrity: `sha512-${b64(SHA512)} sha1-${b64(SHA1)} sha512-${b64(OTHER_SHA512)}`,
      license: "(MIT OR Apache-2.0)",
      dependencies: { d: "^1.0.0", p: "^1.0.0" },
      peerDependencies: { p: "^1.0.0" },
    },
    "node_modules/@s/a/node_modules/d": {
      version: "1.0.0",
      resolved: "https://registry.example.test/d/-/d-1.0.0.tgz",
      integrity: `sha256-${b64(SHA256)}`,
      license: "SEE LICENSE IN x",
    },
    "node_modules/alias": {
      name: "real",
      version: "1.0.0",
      integrity: `sha384-${b64(SHA384)}`,
      license: "Apache-2.0 WITH LLVM-exception",
    },
    "node_modules/b": {
      version: "1.0.0",
      dev: true,
      license: "MIT",
      integrity: ` md5-AAAA sha512-${b64(bytes(10, 9))} nodash sha512`,
      dependencies: { e: "^1.0.0", f: "^1.0.0" },
    },
    "node_modules/c": {
      version: "1.0.0",
      optional: true,
      license: "MIT OR",
      resolved: "x+y://example.test/c",
    },
    "node_modules/d": {
      version: "2.0.0",
      resolved: "git+ssh://git@example.test/d.git#abc",
      license: "UNLICENSED",
    },
    "node_modules/e": { version: "1.0.0", dev: true, license: "  ", resolved: "../local/e" },
    "node_modules/f": {
      version: "1.0.0+build.1",
      devOptional: true,
      license: "(MIT AND ISC)",
      resolved: "git://example.test/f.git",
    },
    "node_modules/p": {
      version: "1.0.0",
      peer: true,
      license: "GPL-2.0+ OR LicenseRef-x.1",
      dependencies: "not-an-object",
    },
    "node_modules/w": { resolved: "packages/w", link: true },
    "packages/w": {
      name: "w",
      version: "0.1.0",
      dependencies: { d: "^2.0.0" },
      devDependencies: { e: "^1.0.0" },
      optionalDependencies: { f: "^1.0.0" },
    },
  },
}

const ROOT_REF = "fixture-app@1.2.3"

const COMPONENTS = {
  a: {
    type: "library",
    "bom-ref": "node_modules/@s/a",
    group: "@s",
    name: "a",
    version: "1.0.0",
    purl: "pkg:npm/%40s/a@1.0.0",
    scope: "required",
    hashes: [
      { alg: "SHA-512", content: hex(SHA512) },
      { alg: "SHA-1", content: hex(SHA1) },
    ],
    licenses: [{ expression: "(MIT OR Apache-2.0)" }],
    externalReferences: [
      { type: "distribution", url: "https://registry.example.test/@s/a/-/a-1.0.0.tgz" },
    ],
  },
  nestedD: {
    type: "library",
    "bom-ref": "node_modules/@s/a/node_modules/d",
    name: "d",
    version: "1.0.0",
    purl: "pkg:npm/d@1.0.0",
    scope: "required",
    hashes: [{ alg: "SHA-256", content: hex(SHA256) }],
    licenses: [{ license: { name: "SEE LICENSE IN x" } }],
    externalReferences: [
      { type: "distribution", url: "https://registry.example.test/d/-/d-1.0.0.tgz" },
    ],
  },
  alias: {
    type: "library",
    "bom-ref": "node_modules/alias",
    name: "real",
    version: "1.0.0",
    purl: "pkg:npm/real@1.0.0",
    scope: "required",
    hashes: [{ alg: "SHA-384", content: hex(SHA384) }],
    licenses: [{ expression: "Apache-2.0 WITH LLVM-exception" }],
  },
  b: {
    type: "library",
    "bom-ref": "node_modules/b",
    name: "b",
    version: "1.0.0",
    purl: "pkg:npm/b@1.0.0",
    scope: "excluded",
    licenses: [{ expression: "MIT" }],
  },
  c: {
    type: "library",
    "bom-ref": "node_modules/c",
    name: "c",
    version: "1.0.0",
    purl: "pkg:npm/c@1.0.0",
    scope: "optional",
    licenses: [{ license: { name: "MIT OR" } }],
  },
  d: {
    type: "library",
    "bom-ref": "node_modules/d",
    name: "d",
    version: "2.0.0",
    purl: "pkg:npm/d@2.0.0",
    scope: "required",
    licenses: [{ license: { name: "UNLICENSED" } }],
    externalReferences: [{ type: "vcs", url: "ssh://git@example.test/d.git#abc" }],
  },
  e: {
    type: "library",
    "bom-ref": "node_modules/e",
    name: "e",
    version: "1.0.0",
    purl: "pkg:npm/e@1.0.0",
    scope: "excluded",
  },
  f: {
    type: "library",
    "bom-ref": "node_modules/f",
    name: "f",
    version: "1.0.0+build.1",
    purl: "pkg:npm/f@1.0.0%2Bbuild.1",
    scope: "optional",
    licenses: [{ expression: "(MIT AND ISC)" }],
    externalReferences: [{ type: "vcs", url: "git://example.test/f.git" }],
  },
  p: {
    type: "library",
    "bom-ref": "node_modules/p",
    name: "p",
    version: "1.0.0",
    purl: "pkg:npm/p@1.0.0",
    scope: "required",
    licenses: [{ expression: "GPL-2.0+ OR LicenseRef-x.1" }],
  },
  w: {
    type: "library",
    "bom-ref": "packages/w",
    name: "w",
    version: "0.1.0",
    purl: "pkg:npm/w@0.1.0",
    scope: "required",
  },
}

const METADATA = {
  lifecycles: [{ phase: "pre-build" }],
  tools: { components: [{ type: "application", name: "repo-contract sbom preset" }] },
  component: {
    type: "library",
    "bom-ref": ROOT_REF,
    name: "fixture-app",
    version: "1.2.3",
    purl: "pkg:npm/fixture-app@1.2.3",
    licenses: [{ expression: "MIT" }],
  },
}

const FULL = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: METADATA,
  components: [
    COMPONENTS.a,
    COMPONENTS.nestedD,
    COMPONENTS.alias,
    COMPONENTS.b,
    COMPONENTS.c,
    COMPONENTS.d,
    COMPONENTS.e,
    COMPONENTS.f,
    COMPONENTS.p,
    COMPONENTS.w,
  ],
  dependencies: [
    {
      ref: ROOT_REF,
      dependsOn: [
        "node_modules/@s/a",
        "node_modules/alias",
        "node_modules/b",
        "node_modules/c",
        "node_modules/d",
        "node_modules/p",
        "packages/w",
      ],
    },
    { ref: "node_modules/@s/a", dependsOn: ["node_modules/@s/a/node_modules/d", "node_modules/p"] },
    { ref: "node_modules/@s/a/node_modules/d", dependsOn: [] },
    { ref: "node_modules/alias", dependsOn: [] },
    { ref: "node_modules/b", dependsOn: ["node_modules/e", "node_modules/f"] },
    { ref: "node_modules/c", dependsOn: [] },
    { ref: "node_modules/d", dependsOn: [] },
    { ref: "node_modules/e", dependsOn: [] },
    { ref: "node_modules/f", dependsOn: [] },
    { ref: "node_modules/p", dependsOn: [] },
    { ref: "packages/w", dependsOn: ["node_modules/d", "node_modules/e", "node_modules/f"] },
  ],
}

const PRODUCTION = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: METADATA,
  components: [
    COMPONENTS.a,
    COMPONENTS.nestedD,
    COMPONENTS.alias,
    COMPONENTS.c,
    COMPONENTS.d,
    COMPONENTS.f,
    COMPONENTS.p,
    COMPONENTS.w,
  ],
  dependencies: [
    {
      ref: ROOT_REF,
      dependsOn: [
        "node_modules/@s/a",
        "node_modules/alias",
        "node_modules/c",
        "node_modules/d",
        "node_modules/p",
        "packages/w",
      ],
    },
    { ref: "node_modules/@s/a", dependsOn: ["node_modules/@s/a/node_modules/d", "node_modules/p"] },
    { ref: "node_modules/@s/a/node_modules/d", dependsOn: [] },
    { ref: "node_modules/alias", dependsOn: [] },
    { ref: "node_modules/c", dependsOn: [] },
    { ref: "node_modules/d", dependsOn: [] },
    { ref: "node_modules/f", dependsOn: [] },
    { ref: "node_modules/p", dependsOn: [] },
    { ref: "packages/w", dependsOn: ["node_modules/d", "node_modules/f"] },
  ],
}

const UUID_V5 = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temporary directory holding `lock` as package-lock.json (or nothing for `null`). */
function workspace(lock: unknown = LOCK): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-sbom-"))
  dirs.push(dir)
  if (lock !== null) writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock))
  return dir
}

/** Runs the generator the preset configures, in `cwd`, and returns its parsed report. */
function generate(cwd: string, options: SbomOptions = {}): unknown {
  const [command, ...args] = sbom(options).run as readonly string[]
  const child = spawnSync(command ?? "node", args, { cwd, encoding: "utf8" })
  expect(child.status, child.stderr).toBe(0)
  expect(child.stderr).toBe("")
  return JSON.parse(child.stdout) as unknown
}

const read = (dir: string, file: string): string => readFileSync(path.join(dir, file), "utf8")
const readJson = (dir: string, file: string): Record<string, unknown> =>
  JSON.parse(read(dir, file)) as Record<string, unknown>
const writeJson = (dir: string, file: string, value: unknown, indent?: number): void => {
  writeFileSync(path.join(dir, file), JSON.stringify(value, null, indent))
}

describe("sbom preset: generator (write mode)", () => {
  it("writes both documents, creating their directory, and reports their sizes", () => {
    const dir = workspace()
    expect(generate(dir, { write: true })).toStrictEqual({
      ok: true,
      documents: [
        doc("docs/sbom.cdx.json", "written", 10),
        doc("docs/sbom.production.cdx.json", "written", 8),
      ],
    })
  })

  it("lists every locked package, its hashes, license, purl and dependency edges", () => {
    const dir = workspace()
    generate(dir, { write: true })
    const { serialNumber, ...full } = readJson(dir, "docs/sbom.cdx.json")
    expect(full).toStrictEqual(FULL)
    expect(serialNumber).toMatch(UUID_V5)
  })

  it("leaves dev packages and dev edges out of the production document", () => {
    const dir = workspace()
    generate(dir, { write: true })
    const { serialNumber, ...production } = readJson(dir, "docs/sbom.production.cdx.json")
    expect(production).toStrictEqual(PRODUCTION)
    expect(serialNumber).toMatch(UUID_V5)
    expect(serialNumber).not.toBe(readJson(dir, "docs/sbom.cdx.json").serialNumber)
  })

  it("writes pretty JSON in a fixed key order, ending in a newline", () => {
    const dir = workspace()
    generate(dir, { write: true })
    const text = read(dir, "docs/sbom.cdx.json")
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      "bomFormat",
      "specVersion",
      "serialNumber",
      "version",
      "metadata",
      "components",
      "dependencies",
    ])
    expect(Object.keys(FULL.components[0] ?? {})).toEqual(
      Object.keys((JSON.parse(text) as typeof FULL).components[0] ?? {}),
    )
  })

  it("is deterministic: the same lockfile gives byte-identical documents", () => {
    const first = workspace()
    const second = workspace()
    generate(first, { write: true })
    generate(second, { write: true })
    expect(read(second, "docs/sbom.cdx.json")).toBe(read(first, "docs/sbom.cdx.json"))
    expect(read(second, "docs/sbom.production.cdx.json")).toBe(
      read(first, "docs/sbom.production.cdx.json"),
    )
  })

  it("derives the serial number from the content", () => {
    const changed = structuredClone(LOCK)
    changed.packages["node_modules/p"].version = "1.0.1"
    const first = workspace()
    const second = workspace(changed)
    generate(first, { write: true })
    generate(second, { write: true })
    expect(readJson(second, "docs/sbom.cdx.json").serialNumber).not.toBe(
      readJson(first, "docs/sbom.cdx.json").serialNumber,
    )
  })

  it("honours custom paths and skips the production document when it is null", () => {
    const dir = workspace()
    writeFileSync(path.join(dir, "other-lock.json"), JSON.stringify(LOCK))
    expect(
      generate(dir, {
        lockfile: "other-lock.json",
        output: "out/bom.json",
        productionOutput: null,
        write: true,
      }),
    ).toStrictEqual({ ok: true, documents: [doc("out/bom.json", "written", 10)] })
  })

  it("names an unnamed root 'root' and still lists its edges", () => {
    const lock = structuredClone(LOCK) as { packages: Record<string, Record<string, unknown>> }
    lock.packages[""] = { dependencies: { d: "^2.0.0" } }
    const dir = workspace(lock)
    generate(dir, { write: true, productionOutput: null })
    const full = readJson(dir, "docs/sbom.cdx.json") as unknown as typeof FULL
    expect(full.metadata.component).toStrictEqual({
      type: "library",
      "bom-ref": "root",
      name: "root",
    })
    expect(full.dependencies[0]).toStrictEqual({ ref: "root", dependsOn: ["node_modules/d"] })
  })

  it("uses the name alone as the root ref when the root has no version", () => {
    const lock = structuredClone(LOCK) as { packages: Record<string, Record<string, unknown>> }
    lock.packages[""] = { name: "@o/app" }
    const dir = workspace(lock)
    generate(dir, { write: true, productionOutput: null })
    const full = readJson(dir, "docs/sbom.cdx.json") as unknown as typeof FULL
    expect(full.metadata.component).toStrictEqual({
      type: "library",
      "bom-ref": "@o/app",
      group: "@o",
      name: "app",
    })
  })

  it("handles a lockfile with no root entry and a workspace with no name", () => {
    const dir = workspace({
      lockfileVersion: 3,
      packages: {
        "packages/x": { version: "1.0.0" },
        "node_modules/x": { link: true, resolved: "packages/x" },
      },
    })
    generate(dir, { write: true, productionOutput: null })
    const full = readJson(dir, "docs/sbom.cdx.json") as unknown as typeof FULL
    expect(full.components).toStrictEqual([
      {
        type: "library",
        "bom-ref": "packages/x",
        name: "packages/x",
        version: "1.0.0",
        purl: "pkg:npm/packages%2Fx@1.0.0",
        scope: "required",
      },
    ])
    expect(full.dependencies).toStrictEqual([
      { ref: "root", dependsOn: [] },
      { ref: "packages/x", dependsOn: [] },
    ])
  })
})

describe("sbom preset: generator (check mode)", () => {
  /** A workspace whose documents were just written. */
  function written(): string {
    const dir = workspace()
    generate(dir, { write: true })
    return dir
  }

  it("reports both documents current right after writing them", () => {
    expect(generate(written())).toStrictEqual({
      ok: true,
      documents: [
        doc("docs/sbom.cdx.json", "current", 10),
        doc("docs/sbom.production.cdx.json", "current", 8),
      ],
    })
  })

  it("never writes in check mode", () => {
    const dir = workspace()
    expect(generate(dir)).toStrictEqual({
      ok: true,
      documents: [
        doc("docs/sbom.cdx.json", "missing", 10),
        doc("docs/sbom.production.cdx.json", "missing", 8),
      ],
    })
    expect(() => read(dir, "docs/sbom.cdx.json")).toThrow()
  })

  it("reports a document stale when the lockfile changes", () => {
    const dir = written()
    const changed = structuredClone(LOCK)
    changed.packages["node_modules/b"].version = "1.0.1"
    writeJson(dir, "package-lock.json", changed)
    expect(generate(dir)).toStrictEqual({
      ok: true,
      documents: [
        doc("docs/sbom.cdx.json", "stale", 10),
        doc("docs/sbom.production.cdx.json", "current", 8),
      ],
    })
  })

  it("reports a document stale when its content is edited", () => {
    const dir = written()
    const edited = readJson(dir, "docs/sbom.production.cdx.json")
    ;(edited.components as unknown[]).pop()
    writeJson(dir, "docs/sbom.production.cdx.json", edited)
    expect((generate(dir) as { documents: unknown[] }).documents[1]).toStrictEqual(
      doc("docs/sbom.production.cdx.json", "stale", 8),
    )
  })

  it("reports a document stale when an array's order changes", () => {
    const dir = written()
    const edited = readJson(dir, "docs/sbom.cdx.json")
    ;(edited.components as unknown[]).reverse()
    writeJson(dir, "docs/sbom.cdx.json", edited)
    expect((generate(dir) as { documents: unknown[] }).documents[0]).toStrictEqual(
      doc("docs/sbom.cdx.json", "stale", 10),
    )
  })

  it.each([
    ["not JSON", "{"],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
  ])("reports a document invalid when it is %s", (_label, text) => {
    const dir = written()
    writeFileSync(path.join(dir, "docs/sbom.cdx.json"), text)
    expect((generate(dir) as { documents: unknown[] }).documents[0]).toStrictEqual(
      doc("docs/sbom.cdx.json", "invalid", 10),
    )
  })

  it("ignores the serial number, the timestamp, key order and formatting", () => {
    const dir = written()
    const original = readJson(dir, "docs/sbom.cdx.json")
    const metadata = original.metadata as Record<string, unknown>
    const reordered = Object.fromEntries(Object.entries(original).reverse())
    reordered.serialNumber = "urn:uuid:00000000-0000-4000-8000-000000000000"
    reordered.metadata = {
      timestamp: "2026-01-01T00:00:00Z",
      ...Object.fromEntries(Object.entries(metadata).reverse()),
    }
    writeJson(dir, "docs/sbom.cdx.json", reordered)
    expect((generate(dir) as { documents: unknown[] }).documents[0]).toStrictEqual(
      doc("docs/sbom.cdx.json", "current", 10),
    )
  })

  it("still compares a document whose metadata is missing", () => {
    const dir = written()
    const rest = readJson(dir, "docs/sbom.cdx.json")
    delete rest.metadata
    writeJson(dir, "docs/sbom.cdx.json", { ...rest, metadata: null })
    expect((generate(dir) as { documents: unknown[] }).documents[0]).toStrictEqual(
      doc("docs/sbom.cdx.json", "stale", 10),
    )
    writeJson(dir, "docs/sbom.cdx.json", rest)
    expect((generate(dir) as { documents: unknown[] }).documents[0]).toStrictEqual(
      doc("docs/sbom.cdx.json", "stale", 10),
    )
  })
})

describe("sbom preset: generator (lockfile errors)", () => {
  it("reports a missing lockfile", () => {
    expect(generate(workspace(null))).toStrictEqual({
      ok: false,
      error: 'Cannot read the lockfile "package-lock.json".',
    })
  })

  it("reports a lockfile that is JSON null", () => {
    const dir = workspace(null)
    writeFileSync(path.join(dir, "package-lock.json"), "null")
    expect(generate(dir)).toStrictEqual({
      ok: false,
      error:
        'The lockfile "package-lock.json" has no packages map: lockfileVersion 2 or 3 is required.',
    })
  })

  it("reports a lockfile that is not JSON", () => {
    const dir = workspace(null)
    writeFileSync(path.join(dir, "package-lock.json"), "{")
    expect(generate(dir)).toStrictEqual({
      ok: false,
      error: 'The lockfile "package-lock.json" is not valid JSON.',
    })
  })

  it.each([
    ["a version 1 lockfile", { lockfileVersion: 1, dependencies: {} }],
    ["a null packages map", { packages: null }],
    ["a packages array", { packages: [] }],
    ["a packages string", { packages: "x" }],
  ])("reports a lockfile without a packages map: %s", (_label, lock) => {
    expect(generate(workspace(lock))).toStrictEqual({
      ok: false,
      error:
        'The lockfile "package-lock.json" has no packages map: lockfileVersion 2 or 3 is required.',
    })
  })

  it("ignores a key named like an Object prototype property", () => {
    const lock = structuredClone(LOCK) as { packages: Record<string, Record<string, unknown>> }
    lock.packages["node_modules/c"] = {
      version: "1.0.0",
      optional: true,
      integrity: "constructor-AAAA toString-AAAA",
      dependencies: { constructor: "1", __proto__x: "1" },
    }
    const dir = workspace(lock)
    generate(dir, { write: true, productionOutput: null })
    const full = readJson(dir, "docs/sbom.cdx.json") as unknown as typeof FULL
    const c = full.components.find((entry) => entry["bom-ref"] === "node_modules/c")
    expect(c).toStrictEqual({
      type: "library",
      "bom-ref": "node_modules/c",
      name: "c",
      version: "1.0.0",
      purl: "pkg:npm/c@1.0.0",
      scope: "optional",
    })
  })
})

// ---------------------------------------------------------------------------------------------
// The official CycloneDX 1.6 JSON schema, as @cyclonedx/cyclonedx-library ships it.

const SCHEMA_DIR = path.join("node_modules", "@cyclonedx", "cyclonedx-library", "res", "schema")
const loadSchema = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(SCHEMA_DIR, `${name}.SNAPSHOT.schema.json`), "utf8")) as Record<
    string,
    unknown
  >

function cyclonedxValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  addDraft2019Formats(ajv)
  // The bundled schema refers to its siblings by their SNAPSHOT file names.
  for (const name of ["spdx", "jsf-0.82"]) {
    ajv.addSchema({
      ...loadSchema(name),
      $id: `http://cyclonedx.org/schema/${name}.SNAPSHOT.schema.json`,
    })
  }
  return ajv.compile(loadSchema("bom-1.6"))
}

describe("sbom preset: documents validate against the official CycloneDX 1.6 schema", () => {
  const validate = cyclonedxValidator()

  it("validates the fixture's full and production documents", () => {
    const dir = workspace()
    generate(dir, { write: true })
    for (const file of ["docs/sbom.cdx.json", "docs/sbom.production.cdx.json"]) {
      expect(validate(readJson(dir, file)), JSON.stringify(validate.errors)).toBe(true)
    }
  })

  it("validates the documents built from this repository's own package-lock.json", () => {
    const dir = workspace(JSON.parse(readFileSync("package-lock.json", "utf8")))
    const report = generate(dir, { write: true }) as { documents: { components: number }[] }
    expect(report.documents[0]?.components).toBeGreaterThan(100)
    for (const file of ["docs/sbom.cdx.json", "docs/sbom.production.cdx.json"]) {
      expect(validate(readJson(dir, file)), JSON.stringify(validate.errors)).toBe(true)
    }
  })

  it("rejects a document the schema forbids, so the validator is live", () => {
    expect(validate({ bomFormat: "CycloneDX", specVersion: "1.6", serialNumber: "x" })).toBe(false)
  })
})
