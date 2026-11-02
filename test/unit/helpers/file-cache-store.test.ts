import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFileCacheStore } from "../../../src/helpers/file-cache-store.js"

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rc-file-cache-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("createFileCacheStore", () => {
  it("reads back what it wrote, creating directories as needed", async () => {
    const store = createFileCacheStore(path.join(root, "cache"))
    await store.write("index/tests/a.json", "hello")
    expect(await store.read("index/tests/a.json")).toBe("hello")
    expect(await readFile(path.join(root, "cache", "index", "tests", "a.json"), "utf8")).toBe(
      "hello",
    )
  })

  it("replaces existing content", async () => {
    const store = createFileCacheStore(root)
    await store.write("a.json", "one")
    await store.write("a.json", "two")
    expect(await store.read("a.json")).toBe("two")
  })

  it("reads an absent path as undefined, including when its directory is absent", async () => {
    const store = createFileCacheStore(path.join(root, "never-created"))
    expect(await store.read("index/x/y.json")).toBeUndefined()
  })

  it("lets any other read failure through rather than calling it a miss", async () => {
    const store = createFileCacheStore(root)
    await mkdir(path.join(root, "dir.json"))
    await expect(store.read("dir.json")).rejects.toThrow(/EISDIR/)
  })

  it("removes a path and treats an absent one as done", async () => {
    const store = createFileCacheStore(root)
    await store.write("a.json", "x")
    await store.remove("a.json")
    await store.remove("a.json")
    expect(await store.read("a.json")).toBeUndefined()
  })

  it("lists paths under a prefix, slash-separated and sorted, and nothing else", async () => {
    const store = createFileCacheStore(root)
    await store.write("index/b/2.json", "x")
    await store.write("index/a/1.json", "x")
    await store.write("blobs/z", "x")
    expect(await store.list("index/")).toEqual(["index/a/1.json", "index/b/2.json"])
    expect(await store.list("blobs/")).toEqual(["blobs/z"])
    expect(await store.list("missing/")).toEqual([])
  })

  it("lists nothing when the cache directory does not exist", async () => {
    expect(await createFileCacheStore(path.join(root, "nope")).list("")).toEqual([])
  })

  it("never lists or leaves a temporary file behind", async () => {
    const store = createFileCacheStore(root)
    await Promise.all(
      Array.from({ length: 20 }, (_unused, index) => store.write("a/b.json", `v${String(index)}`)),
    )
    expect(await readdir(path.join(root, "a"))).toEqual(["b.json"])
    expect(await store.list("")).toEqual(["a/b.json"])
  })

  it("leaves one whole value when writers race for the same path", async () => {
    const store = createFileCacheStore(root)
    const values = Array.from({ length: 30 }, (_unused, index) => String(index).repeat(5000))
    await Promise.all(values.map((value) => store.write("race.json", value)))
    expect(values).toContain(await store.read("race.json"))
  })

  it("skips a temporary file another process left half-written", async () => {
    const store = createFileCacheStore(root)
    await store.write("index/a.json", "x")
    await writeFile(path.join(root, "index", "b.json.123.abcd.tmp"), "partial")
    expect(await store.list("index/")).toEqual(["index/a.json"])
  })

  it("does not follow a symbolic link out of the cache", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "rc-outside-"))
    try {
      await writeFile(path.join(outside, "secret.json"), "secret")
      await mkdir(path.join(root, "index"))
      await symlink(outside, path.join(root, "index", "link"))
      const store = createFileCacheStore(root)
      expect(await store.list("index/")).toEqual([])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it.each([
    "",
    "/etc/passwd",
    "../x",
    "a/../../x",
    "a/./b",
    "a//b",
    "a\\b",
    "a/b/",
    "C:/x",
    "a\0b",
  ])("rejects the unsafe path %j", async (unsafe) => {
    const store = createFileCacheStore(root)
    await expect(store.read(unsafe)).rejects.toThrow(/Unsafe cache path/)
    await expect(store.write(unsafe, "x")).rejects.toThrow(/Unsafe cache path/)
    await expect(store.remove(unsafe)).rejects.toThrow(/Unsafe cache path/)
  })

  it("accepts an empty or directory prefix when listing, and rejects an unsafe one", async () => {
    const store = createFileCacheStore(root)
    await store.write("a/b.json", "x")
    expect(await store.list("")).toEqual(["a/b.json"])
    expect(await store.list("a/")).toEqual(["a/b.json"])
    await expect(store.list("../")).rejects.toThrow(/Unsafe cache path/)
    await expect(store.list("/")).rejects.toThrow(/Unsafe cache path/)
  })
})

describe("createFileCacheStore: edges", () => {
  it("treats a path under a file as absent, and a file where a directory is wanted as nothing to list", async () => {
    const store = createFileCacheStore(root)
    await store.write("a", "x")
    expect(await store.read("a/b")).toBeUndefined()
    expect(await store.list("a/")).toEqual([])
    expect(await store.list("a/b")).toEqual([])
  })

  it("lets a permission failure through on read and on list rather than calling it absent", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return
    const store = createFileCacheStore(root)
    await store.write("locked/a.json", "x")
    await chmod(path.join(root, "locked"), 0o000)
    try {
      await expect(store.read("locked/a.json")).rejects.toThrow(/EACCES/)
      await expect(store.list("locked/")).rejects.toThrow(/EACCES/)
    } finally {
      await chmod(path.join(root, "locked"), 0o700)
    }
  })

  it("cleans up its temporary file and reports the failure when it cannot put the file in place", async () => {
    const store = createFileCacheStore(root)
    await mkdir(path.join(root, "index", "x", "y.json"), { recursive: true })
    await expect(store.write("index/x/y.json", "content")).rejects.toThrow()
    const left = await readdir(path.join(root, "index", "x"))
    expect(left).toEqual(["y.json"])
  })

  it("writes text as UTF-8 and reads it back unchanged", async () => {
    const store = createFileCacheStore(root)
    await store.write("t.json", "é✓ \n")
    expect(await store.read("t.json")).toBe("é✓ \n")
    expect((await readFile(path.join(root, "t.json"))).toString("hex")).toBe(
      Buffer.from("é✓ \n").toString("hex"),
    )
  })

  it("lists by name prefix as well as by directory, sorted, in any directory depth", async () => {
    const store = createFileCacheStore(root)
    for (const name of [
      "index/tests/b.json",
      "index/tests/a.json",
      "index/lint/a.json",
      "index/tests/sub/c.json",
      "other.json",
    ]) {
      await store.write(name, "x")
    }
    expect(await store.list("")).toEqual([
      "index/lint/a.json",
      "index/tests/a.json",
      "index/tests/b.json",
      "index/tests/sub/c.json",
      "other.json",
    ])
    expect(await store.list("index")).toEqual(await store.list("index/"))
    expect(await store.list("index/tests/")).toEqual([
      "index/tests/a.json",
      "index/tests/b.json",
      "index/tests/sub/c.json",
    ])
    expect(await store.list("index/tests/a")).toEqual(["index/tests/a.json"])
    expect(await store.list("index/tests/sub")).toEqual(["index/tests/sub/c.json"])
    expect(await store.list("index/t")).toEqual([
      "index/tests/a.json",
      "index/tests/b.json",
      "index/tests/sub/c.json",
    ])
    expect(await store.list("o")).toEqual(["other.json"])
    expect(await store.list("zzz")).toEqual([])
  })

  it("rejects an unsafe prefix, with or without a trailing slash", async () => {
    const store = createFileCacheStore(root)
    for (const prefix of ["..", "../", "a/../b", "/abs", "a//b", "a\\b", "c:"]) {
      await expect(store.list(prefix)).rejects.toThrow(TypeError)
    }
  })
})

describe("createFileCacheStore: failures and order", () => {
  it("reports the real error, not a missing temporary file, when the write itself fails", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return
    const store = createFileCacheStore(root)
    await mkdir(path.join(root, "ro"))
    await chmod(path.join(root, "ro"), 0o500)
    try {
      await expect(store.write("ro/a.json", "x")).rejects.toThrow(/EACCES/)
    } finally {
      await chmod(path.join(root, "ro"), 0o700)
    }
  })

  it("lists in plain string order even when a directory and a file share a name stem", async () => {
    const store = createFileCacheStore(root)
    await store.write("a/x.json", "1")
    await store.write("a.json", "2")
    await store.write("a-b.json", "3")
    expect(await store.list("")).toEqual(["a-b.json", "a.json", "a/x.json"])
  })
})
