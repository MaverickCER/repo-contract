import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { packArtifacts, unpackArtifacts } from "../../../src/affected/artifacts.js"

const text = (s: string) => new TextEncoder().encode(s)

describe("packArtifacts", () => {
  it("records each file's path, content and checksum, sorted by path", () => {
    const packed = packArtifacts([
      { path: "dist/b.js", content: text("b") },
      { path: "dist/a.js", content: text("a") },
    ])
    expect(packed.format).toBe(1)
    expect(packed.files.map((f) => f.path)).toEqual(["dist/a.js", "dist/b.js"])
    expect(packed.files[0]).toEqual({
      path: "dist/a.js",
      data: Buffer.from("a").toString("base64"),
      sha256: createHash("sha256").update("a").digest("hex"),
    })
  })

  it("keeps the bytes exactly, whatever they are", () => {
    const packed = packArtifacts([{ path: "dist/x.bin", content: new Uint8Array([0, 255, 128]) }])
    expect(packed.files[0]).toEqual({
      path: "dist/x.bin",
      data: "AP+A",
      sha256: createHash("sha256")
        .update(new Uint8Array([0, 255, 128]))
        .digest("hex"),
    })
  })

  it("keeps text as UTF-8", () => {
    const packed = packArtifacts([{ path: "dist/t.txt", content: text("é") }])
    expect(packed.files[0]?.data).toBe(Buffer.from("é", "utf8").toString("base64"))
  })

  it("says which path was unsafe", () => {
    expect(() => packArtifacts([{ path: "../x", content: text("") }])).toThrow(
      'Artifact path "../x" is not a safe relative path.',
    )
  })

  it("sorts by path whatever order they arrive in, a prefix before what extends it", () => {
    const packed = packArtifacts(
      ["dist/b", "dist/a/z", "dist/a", "dist/B"].map((path) => ({ path, content: text("") })),
    )
    expect(packed.files.map((f) => f.path)).toEqual(["dist/B", "dist/a", "dist/a/z", "dist/b"])
  })

  it("survives JSON, so it can be a cache value", () => {
    const packed = packArtifacts([{ path: "dist/x.bin", content: new Uint8Array([0, 255, 128]) }])
    expect(JSON.parse(JSON.stringify(packed))).toEqual(packed)
  })

  it("packs nothing as an empty set", () => {
    expect(packArtifacts([])).toEqual({ format: 1, files: [] })
  })

  it.each([
    "",
    "/abs.js",
    "../out.js",
    "dist/../../out.js",
    "dist//x.js",
    "dist\\x.js",
    "./x.js",
    "a\0b",
    "C:/x.js",
    "dist/",
  ])("refuses the unsafe path %j", (path) => {
    expect(() => packArtifacts([{ path, content: text("x") }])).toThrow(TypeError)
  })

  it("refuses the same path twice", () => {
    expect(() =>
      packArtifacts([
        { path: "dist/a.js", content: text("1") },
        { path: "dist/a.js", content: text("2") },
      ]),
    ).toThrow("dist/a.js is listed more than once")
  })
})

describe("unpackArtifacts", () => {
  const packed = packArtifacts([
    { path: "dist/a.js", content: text("alpha") },
    { path: "dist/sub/b.bin", content: new Uint8Array([1, 2, 3]) },
  ])

  it("returns the files exactly as they were packed", () => {
    const result = unpackArtifacts(packed)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.files.map((f) => f.path)).toEqual(["dist/a.js", "dist/sub/b.bin"])
      expect(new TextDecoder().decode(result.files[0]?.content)).toBe("alpha")
      expect([...(result.files[1]?.content ?? [])]).toEqual([1, 2, 3])
    }
  })

  it("round-trips through JSON", () => {
    expect(unpackArtifacts(JSON.parse(JSON.stringify(packed))).ok).toBe(true)
  })

  it("refuses content whose checksum does not match, naming the file", () => {
    const tampered = {
      ...packed,
      files: [{ ...packed.files[0]!, data: Buffer.from("evil").toString("base64") }],
    }
    expect(unpackArtifacts(tampered)).toEqual({
      ok: false,
      error: "dist/a.js does not match its checksum.",
    })
  })

  it.each([
    [null, "The artifacts are not an object."],
    ["x", "The artifacts are not an object."],
    [{ format: 2, files: [] }, "The artifacts use format 2, not 1."],
    [{ format: 1 }, "The artifacts have no file list."],
    [{ format: 1, files: {} }, "The artifacts have no file list."],
    [{ format: 1, files: [null] }, "Artifact 0 is not an object."],
    [
      { format: 1, files: [{ path: "a.js", data: 1, sha256: "x" }] },
      "Artifact a.js has no content or checksum.",
    ],
    [
      { format: 1, files: [{ path: "a.js", data: "", sha256: 1 }] },
      "Artifact a.js has no content or checksum.",
    ],
    [{ format: 1, files: [{ path: 5, data: "", sha256: "x" }] }, "Artifact 0 has no path."],
    [
      { format: 1, files: [{ path: "../a.js", data: "", sha256: "x" }] },
      'Artifact path "../a.js" is not a safe relative path.',
    ],
  ])("refuses %j", (value, error) => {
    expect(unpackArtifacts(value)).toEqual({ ok: false, error })
  })

  it("refuses a path listed twice", () => {
    const file = packed.files[0]!
    expect(unpackArtifacts({ format: 1, files: [file, file] })).toEqual({
      ok: false,
      error: "dist/a.js is listed more than once.",
    })
  })

  it("accepts an empty set", () => {
    expect(unpackArtifacts({ format: 1, files: [] })).toEqual({ ok: true, files: [] })
  })
})
