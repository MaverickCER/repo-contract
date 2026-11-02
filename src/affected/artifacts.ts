import { createHash } from "node:crypto"
import { required } from "./required.js"

/** A file to keep: a safe relative path and its content. */
export interface ArtifactInput {
  readonly path: string
  readonly content: Uint8Array
}

/** A packed file: content as base64, with the checksum it must still have when unpacked. */
export interface PackedArtifact {
  readonly path: string
  readonly data: string
  readonly sha256: string
}

/** A set of files that survives `JSON.stringify`, so it can be a cache value. */
export interface PackedArtifacts {
  readonly format: 1
  readonly files: readonly PackedArtifact[]
}

export type UnpackResult =
  | {
      readonly ok: true
      readonly files: readonly { readonly path: string; readonly content: Uint8Array }[]
    }
  | { readonly ok: false; readonly error: string }

const SAFE_SEGMENT = /^(?!\.{1,2}$)[^\\\0:/]+$/

const isSafePath = (path: string): boolean =>
  path.split("/").every((segment) => SAFE_SEGMENT.test(segment))
const sha256Of = (content: Uint8Array): string => createHash("sha256").update(content).digest("hex")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/**
 * Packs build output so a cache can hold it and restore it later.
 * @param files - The files to keep, by safe relative path.
 * @returns The files, sorted by path, each with its checksum.
 * @throws {TypeError} If a path could name anything outside the directory it is restored into, or repeats.
 */
export function packArtifacts(files: readonly ArtifactInput[]): PackedArtifacts {
  const byPath = new Map<string, PackedArtifact>()
  for (const { path, content } of files) {
    if (!isSafePath(path)) {
      throw new TypeError(`Artifact path ${JSON.stringify(path)} is not a safe relative path.`)
    }
    if (byPath.has(path)) {
      throw new TypeError(`${path} is listed more than once.`)
    }
    byPath.set(path, {
      path,
      data: Buffer.from(content).toString("base64"),
      sha256: sha256Of(content),
    })
  }
  return { format: 1, files: [...byPath.keys()].sort().map((path) => required(byPath, path)) }
}

/**
 * Unpacks a cached set of files, trusting nothing: the shape, every path and every checksum are
 * checked, and any problem means the whole set is refused (a cache miss, never a partial restore).
 * @param value - What the cache returned.
 * @returns The files with their content, or why the set cannot be used.
 */
export function unpackArtifacts(value: unknown): UnpackResult {
  if (!isRecord(value)) return { ok: false, error: "The artifacts are not an object." }
  if (value.format !== 1) {
    return { ok: false, error: `The artifacts use format ${String(value.format)}, not 1.` }
  }
  if (!Array.isArray(value.files)) return { ok: false, error: "The artifacts have no file list." }
  const seen = new Set<string>()
  const files: { path: string; content: Uint8Array }[] = []
  for (const [index, entry] of (value.files as unknown[]).entries()) {
    if (!isRecord(entry)) return { ok: false, error: `Artifact ${String(index)} is not an object.` }
    const { path, data, sha256 } = entry
    if (typeof path !== "string")
      return { ok: false, error: `Artifact ${String(index)} has no path.` }
    if (!isSafePath(path)) {
      return {
        ok: false,
        error: `Artifact path ${JSON.stringify(path)} is not a safe relative path.`,
      }
    }
    if (seen.has(path)) return { ok: false, error: `${path} is listed more than once.` }
    seen.add(path)
    if (typeof data !== "string" || typeof sha256 !== "string") {
      return { ok: false, error: `Artifact ${path} has no content or checksum.` }
    }
    const content = new Uint8Array(Buffer.from(data, "base64"))
    if (sha256Of(content) !== sha256)
      return { ok: false, error: `${path} does not match its checksum.` }
    files.push({ path, content })
  }
  return { ok: true, files }
}
