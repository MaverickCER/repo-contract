import { randomBytes } from "node:crypto"
import {
  mkdir as mkdirFromFs,
  readdir as readdirFromFs,
  readFile as readFileFromFs,
  rename as renameFromFs,
  rm as rmFromFs,
  writeFile as writeFileFromFs,
} from "node:fs/promises"
import path from "node:path"

/**
 * A directory used as a cache store: paths are relative and slash-separated, each maps to a file.
 * Structurally the same as `CacheStore` from `repo-contract/affected`, so it can be passed to
 * `createCache` there; declared here because the two published barrels stay independent.
 */
export interface FileCacheStore {
  /** Reads a file by its store-relative path; resolves to `undefined` if there is none. */
  readonly read: (relativePath: string) => Promise<string | undefined>
  /** Writes atomically: a reader sees the old content or the new, never part of either. */
  readonly write: (relativePath: string, text: string) => Promise<void>
  /** Deletes a file; one that is already gone is not an error. */
  readonly remove: (relativePath: string) => Promise<void>
  /** Lists every file whose store-relative path starts with the prefix, sorted. */
  readonly list: (prefix: string) => Promise<readonly string[]>
}

const TEMPORARY = /\.\d+\.[0-9a-f]+\.tmp$/

/**
 * @param error - What a file operation threw.
 * @returns Whether it means another writer has the file in use right now.
 */
function isContended(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException
  return code === "EPERM" || code === "EBUSY" || code === "EACCES"
}

/**
 * @param error - What a file operation threw.
 * @returns Whether it only means that the path, or a directory on the way to it, is not there.
 */
function isAbsent(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException
  return code === "ENOENT" || code === "ENOTDIR"
}

/**
 * @param value - A path from the caller.
 * @returns The path's segments.
 * @throws {TypeError} If the path is empty, absolute, or could name anything outside the store.
 */
function segmentsOf(value: string): string[] {
  const segments = value.split("/")
  const safe = segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      !segment.includes("\\") &&
      !segment.includes("\0") &&
      !segment.includes(":"),
  )
  if (!safe) {
    throw new TypeError(`Unsafe cache path ${JSON.stringify(value)}.`)
  }
  return segments
}

/**
 * Stores cache entries as files under a directory. Writes go to a temporary file in the same
 * directory and are renamed into place, so concurrent writers and readers never see a partial
 * entry. A directory that does not exist yet is created by the first write.
 * @param directory - The directory the store lives in.
 * @returns The store.
 */
export function createFileCacheStore(directory: string): FileCacheStore {
  const locate = (value: string): string => path.join(directory, ...segmentsOf(value))

  /**
   * @param relative - A directory path under the store, or empty for the store itself.
   * @returns Every file below it, as slash-separated paths relative to the store.
   */
  const walk = async (relative: string): Promise<string[]> => {
    const found: string[] = []
    let children
    try {
      children = await readdirFromFs(path.join(directory, relative), { withFileTypes: true })
    } catch (error) {
      if (isAbsent(error)) {
        return found
      }
      throw error
    }
    for (const child of children) {
      const childPath = path.posix.join(relative, child.name)
      if (child.isDirectory()) {
        found.push(...(await walk(childPath)))
      } else if (child.isFile() && !TEMPORARY.test(child.name)) {
        found.push(childPath)
      }
    }
    return found
  }

  return {
    async read(value) {
      try {
        return await readFileFromFs(locate(value), "utf8")
      } catch (error) {
        if (isAbsent(error)) {
          return undefined
        }
        throw error
      }
    },

    async write(value, content) {
      const target = locate(value)
      await mkdirFromFs(path.dirname(target), { recursive: true })
      const temporary = `${target}.${String(process.pid)}.${randomBytes(6).toString("hex")}.tmp`
      try {
        await writeFileFromFs(temporary, content)
        await renameFromFs(temporary, target)
      } catch (error) {
        await rmFromFs(temporary, { force: true })
        // Windows refuses to replace a file another writer has open. Entries are named by what they
        // were computed from, so a concurrent writer's complete value stands in for ours.
        if (isContended(error)) {
          try {
            await readFileFromFs(target)
            return
          } catch {
            // Nothing readable is there (or it is a directory), so there is no value to stand in for ours.
          }
        }
        throw error
      }
    },

    async remove(value) {
      await rmFromFs(locate(value), { force: true })
    },

    async list(prefix) {
      if (prefix !== "") {
        segmentsOf(prefix.replace(/\/$/, ""))
      }
      const directory = prefix.slice(0, Math.max(0, prefix.lastIndexOf("/")))
      const files = await walk(directory)
      return files.filter((file) => file.startsWith(prefix)).sort()
    },
  }
}
