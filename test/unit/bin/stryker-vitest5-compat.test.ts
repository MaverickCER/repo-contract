import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  LEGACY_JOIN,
  ancestorsOf,
  RUNNER_FILES,
  UPSTREAM_FIX_MARKER,
  VITEST_5_JOIN,
  classify,
  ensureStrykerVitest5Compat,
  findPackageDir,
  isStrictlyInside,
  majorOf,
  tempPathFor,
  writeFileAtomically,
} from "../../../bin/stryker-vitest5-compat.mjs"

// The filesystem root as `path.resolve` sees it: `/` on POSIX, the current drive's root (`C:\\`) on Windows.
const FS_ROOT = path.parse(path.resolve(path.sep)).root
const ROOT = path.join(FS_ROOT, "work", "app")
const RUNNER = path.join(ROOT, "node_modules", "@stryker-mutator", "vitest-runner")
const RUNNER_DIST = path.join(RUNNER, "dist", "src")
const HELPERS = path.join(RUNNER_DIST, "test-helpers.js")
const SETUP = path.join(RUNNER_DIST, "stryker-setup.js")

const legacy = (label: string) => `// ${label}\nreturn ${LEGACY_JOIN};\n// end ${label}\n`
const patched = (label: string) => `// ${label}\nreturn ${VITEST_5_JOIN};\n// end ${label}\n`

function memoryIo(files: Record<string, string>) {
  const store = new Map(Object.entries(files))
  const writes: [string, string][] = []
  return {
    store,
    writes,
    io: {
      exists: (file: string) => store.has(file),
      readFile: (file: string) => {
        const text = store.get(file)
        if (text === undefined) throw new Error(`unexpected read of ${file}`)
        return text
      },
      writeFile: (file: string, text: string) => {
        writes.push([file, text])
        store.set(file, text)
      },
    },
  }
}

const install = (vitestVersion: string, helpers: string, setup: string) => ({
  [path.join(ROOT, "node_modules", "vitest", "package.json")]: JSON.stringify({
    name: "vitest",
    version: vitestVersion,
  }),
  [path.join(RUNNER, "package.json")]: JSON.stringify({ name: "@stryker-mutator/vitest-runner" }),
  [HELPERS]: helpers,
  [SETUP]: setup,
})

/** The files with one left out, as an install missing that file would read. */
const without = (files: Record<string, string>, gone: string) =>
  Object.fromEntries(Object.entries(files).filter(([file]) => file !== gone))

describe("the constants", () => {
  it("name the exact expressions and files the fix is about", () => {
    expect(LEGACY_JOIN).toBe("nameParts.join(' ').trim()")
    expect(VITEST_5_JOIN).toBe("nameParts.join(' > ').trim()")
    expect(UPSTREAM_FIX_MARKER).toBe("testNameSeparator")
    expect(RUNNER_FILES).toEqual(["test-helpers.js", "stryker-setup.js"])
  })
})

describe("the file header", () => {
  it("names what is patched, where, why, and how to opt out", () => {
    const source = readFileSync(path.resolve("bin/stryker-vitest5-compat.mjs"), "utf8")
    const header = source.slice(0, source.indexOf("\nimport "))
    for (const named of [
      LEGACY_JOIN,
      VITEST_5_JOIN,
      ...RUNNER_FILES,
      "node_modules",
      "stryker-js#6210",
      "--no-patch-vitest-runner",
      "patchVitestRunner: false",
    ]) {
      expect(header).toContain(named)
    }
  })
})

describe("tempPathFor()", () => {
  it("puts the process id and a .tmp suffix beside the file", () => {
    expect(tempPathFor(path.join(ROOT, "a.js"), 4242)).toBe(`${path.join(ROOT, "a.js")}.4242.tmp`)
    expect(path.dirname(tempPathFor(path.join(ROOT, "x", "a.js"), 1))).toBe(path.join(ROOT, "x"))
  })
})

describe("writeFileAtomically()", () => {
  it("writes the new text to the temporary file first, then renames it over the target", () => {
    const calls: string[][] = []
    const file = path.join(ROOT, "runner.js")
    writeFileAtomically(file, "new text", {
      write: (target, text) => calls.push(["write", target, text]),
      rename: (from, to) => calls.push(["rename", from, to]),
    })
    const temp = tempPathFor(file, process.pid)
    expect(calls).toEqual([
      ["write", temp, "new text"],
      ["rename", temp, file],
    ])
  })

  it("replaces a real file's contents and leaves no temporary file behind", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stryker-v5-atomic-"))
    try {
      const file = path.join(dir, "runner.js")
      writeFileSync(file, "old text")
      writeFileAtomically(file, "new text")
      expect(readFileSync(file, "utf8")).toBe("new text")
      expect(readdirSync(dir)).toEqual(["runner.js"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("majorOf()", () => {
  it("reads the leading number of a semver string", () => {
    expect(majorOf("5.0.3")).toBe(5)
    expect(majorOf("4.1.11")).toBe(4)
    expect(majorOf("10.2.1")).toBe(10)
    expect(majorOf("0.9.0")).toBe(0)
  })

  it("returns undefined when the string does not start with a major and a dot", () => {
    expect(majorOf("v5.0.0")).toBeUndefined()
    expect(majorOf("5")).toBeUndefined()
    expect(majorOf("latest")).toBeUndefined()
    expect(majorOf("")).toBeUndefined()
    expect(majorOf("x5.0.0")).toBeUndefined()
  })
})

describe("classify()", () => {
  it("recognises each state of a runner file", () => {
    expect(classify(patched("a"))).toBe("patched")
    expect(classify(legacy("a"))).toBe("needs-patch")
    expect(classify("const separator = inject('testNameSeparator')")).toBe("upstream-fixed")
    expect(classify("nothing to see")).toBe("unrecognised")
    expect(classify("")).toBe("unrecognised")
  })

  it("prefers the patched form over the legacy form, and the legacy form over the upstream marker", () => {
    expect(classify(`${legacy("a")}${patched("b")}`)).toBe("patched")
    expect(classify(`${legacy("a")}\n${UPSTREAM_FIX_MARKER}`)).toBe("needs-patch")
    expect(classify(`${patched("a")}\n${UPSTREAM_FIX_MARKER}`)).toBe("patched")
  })
})

describe("ancestorsOf()", () => {
  it("lists the directory and every ancestor up to the root, nearest first", () => {
    expect(ancestorsOf(path.join(ROOT, "packages", "a"))).toEqual([
      path.join(ROOT, "packages", "a"),
      path.join(ROOT, "packages"),
      ROOT,
      path.join(FS_ROOT, "work"),
      FS_ROOT,
    ])
  })

  it("lists only the root when started at the root", () => {
    expect(ancestorsOf(FS_ROOT)).toEqual([FS_ROOT])
  })

  it("resolves a relative start against the current directory", () => {
    const list = ancestorsOf(".")
    expect(list[0]).toBe(process.cwd())
    expect(list.at(-1)).toBe(path.parse(process.cwd()).root)
  })
})

describe("findPackageDir()", () => {
  it("returns the node_modules directory in the starting directory when its package.json exists", () => {
    const { io } = memoryIo({ [path.join(ROOT, "node_modules", "vitest", "package.json")]: "{}" })
    expect(findPackageDir(ROOT, "vitest", io.exists)).toBe(
      path.join(ROOT, "node_modules", "vitest"),
    )
  })

  it("walks up to an ancestor's node_modules", () => {
    const { io } = memoryIo({
      [path.join(FS_ROOT, "work", "node_modules", "vitest", "package.json")]: "{}",
    })
    expect(findPackageDir(path.join(ROOT, "packages", "a"), "vitest", io.exists)).toBe(
      path.join(FS_ROOT, "work", "node_modules", "vitest"),
    )
  })

  it("handles scoped package names", () => {
    const { io } = memoryIo({ [path.join(RUNNER, "package.json")]: "{}" })
    expect(findPackageDir(ROOT, "@stryker-mutator/vitest-runner", io.exists)).toBe(RUNNER)
  })

  it("skips a directory that has no package.json and returns undefined at the filesystem root", () => {
    const asked: string[] = []
    const found = findPackageDir(ROOT, "vitest", (file) => {
      asked.push(file)
      return false
    })
    expect(found).toBeUndefined()
    expect(asked).toEqual([
      path.join(ROOT, "node_modules", "vitest", "package.json"),
      path.join(FS_ROOT, "work", "node_modules", "vitest", "package.json"),
      path.join(FS_ROOT, "node_modules", "vitest", "package.json"),
    ])
  })
})

describe("ensureStrykerVitest5Compat()", () => {
  it("does nothing when Vitest is not installed", () => {
    const { io, writes } = memoryIo({ [path.join(RUNNER, "package.json")]: "{}" })
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "not-needed",
      vitestVersion: undefined,
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("does nothing when the Stryker Vitest runner is not installed", () => {
    const { io, writes } = memoryIo({
      [path.join(ROOT, "node_modules", "vitest", "package.json")]: '{"version":"5.0.3"}',
    })
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "not-needed",
      vitestVersion: undefined,
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("does nothing on Vitest 4, whatever the runner files look like", () => {
    const { io, writes } = memoryIo(install("4.99.0", legacy("h"), legacy("s")))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "not-needed",
      vitestVersion: "4.99.0",
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("does nothing when the Vitest version has no readable major", () => {
    const { io, writes } = memoryIo(install("next", legacy("h"), legacy("s")))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "not-needed",
      vitestVersion: "next",
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("rewrites both runner files on Vitest 5.0.0, keeping everything else in them", () => {
    const { io, writes, store } = memoryIo(install("5.0.0", legacy("helpers"), legacy("setup")))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "patched",
      vitestVersion: "5.0.0",
      patched: [HELPERS, SETUP],
    })
    expect(writes).toEqual([
      [HELPERS, patched("helpers")],
      [SETUP, patched("setup")],
    ])
    expect(store.get(HELPERS)).toBe(patched("helpers"))
    expect(store.get(SETUP)).toBe(patched("setup"))
  })

  it("treats a two-digit Vitest major as 5 or later", () => {
    const { io } = memoryIo(install("10.0.0", legacy("h"), legacy("s")))
    expect(ensureStrykerVitest5Compat(ROOT, io).status).toBe("patched")
  })

  it("is a no-op the second time", () => {
    const { io, writes } = memoryIo(install("5.0.3", legacy("h"), legacy("s")))
    expect(ensureStrykerVitest5Compat(ROOT, io).status).toBe("patched")
    writes.length = 0
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "already-patched",
      vitestVersion: "5.0.3",
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("rewrites only the file that still needs it when the other is already patched", () => {
    const { io, writes } = memoryIo(install("5.0.3", legacy("helpers"), patched("setup")))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "patched",
      vitestVersion: "5.0.3",
      patched: [HELPERS],
    })
    expect(writes).toEqual([[HELPERS, patched("helpers")]])

    const second = memoryIo(install("5.0.3", patched("helpers"), legacy("setup")))
    expect(ensureStrykerVitest5Compat(ROOT, second.io).patched).toEqual([SETUP])
    expect(second.writes).toEqual([[SETUP, patched("setup")]])
  })

  it("leaves a runner that already carries the upstream fix alone", () => {
    const fixed = `const separator = inject('${UPSTREAM_FIX_MARKER}')`
    const { io, writes } = memoryIo(install("5.0.3", fixed, fixed))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "upstream-fixed",
      vitestVersion: "5.0.3",
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("recognises the upstream fix as @stryker-mutator/vitest-runner 10.1.1 ships it", () => {
    // 10.1.1's test-helpers.js takes the separator as a parameter and names the Vitest 5 one;
    // only stryker-setup.js injects `testNameSeparator`.
    const helpers = [
      "export const VITEST_MODERN_TEST_NAME_SEPARATOR = ' > ';",
      "    return nameParts.join(separator).trim();",
    ].join("\n")
    const setup = "const testNameSeparator = inject('testNameSeparator');"
    const { io, writes } = memoryIo(install("5.1.0", helpers, setup))
    expect(ensureStrykerVitest5Compat(ROOT, io)).toEqual({
      status: "upstream-fixed",
      vitestVersion: "5.1.0",
      patched: [],
    })
    expect(writes).toEqual([])
  })

  it("counts a runner file it cannot read as unrecognised, names it, and writes nothing", () => {
    const helpersGone = memoryIo(without(install("5.0.3", legacy("h"), legacy("s")), HELPERS))
    expect(ensureStrykerVitest5Compat(ROOT, helpersGone.io)).toEqual({
      status: "unrecognised",
      vitestVersion: "5.0.3",
      patched: [],
      unreadable: HELPERS,
    })
    expect(helpersGone.writes).toEqual([])

    const setupGone = memoryIo(without(install("5.0.3", legacy("h"), legacy("s")), SETUP))
    expect(ensureStrykerVitest5Compat(ROOT, setupGone.io)).toEqual({
      status: "unrecognised",
      vitestVersion: "5.0.3",
      patched: [],
      unreadable: SETUP,
    })
    expect(setupGone.writes).toEqual([])
  })

  it.each([
    ["truncated", '{"version":"5.0'],
    ["null", "null"],
  ])("counts a %s Vitest package.json as unrecognised and reads no runner file", (_, text) => {
    const vitestManifest = path.join(ROOT, "node_modules", "vitest", "package.json")
    const { io, writes } = memoryIo({
      ...install("5.0.3", legacy("h"), legacy("s")),
      [vitestManifest]: text,
    })
    const reads: string[] = []
    const result = ensureStrykerVitest5Compat(ROOT, {
      ...io,
      readFile: (file: string) => {
        reads.push(file)
        return io.readFile(file)
      },
    })
    expect(result).toEqual({
      status: "unrecognised",
      vitestVersion: undefined,
      patched: [],
      unreadable: vitestManifest,
    })
    expect(reads).toEqual([vitestManifest])
    expect(writes).toEqual([])
  })

  it("counts a runner without its dist files as unrecognised on the real file system", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stryker-v5-compat-missing-"))
    try {
      const runner = path.join(dir, "node_modules", "@stryker-mutator", "vitest-runner")
      mkdirSync(runner, { recursive: true })
      mkdirSync(path.join(dir, "node_modules", "vitest"), { recursive: true })
      writeFileSync(path.join(dir, "node_modules", "vitest", "package.json"), '{"version":"5.0.3"}')
      writeFileSync(path.join(runner, "package.json"), "{}")

      expect(ensureStrykerVitest5Compat(dir)).toEqual({
        status: "unrecognised",
        vitestVersion: "5.0.3",
        patched: [],
        unreadable: path.join(runner, "dist", "src", "test-helpers.js"),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("refuses to rewrite one file when the other is not understood", () => {
    const upstreamMixed = memoryIo(
      install("5.0.3", legacy("h"), `inject('${UPSTREAM_FIX_MARKER}')`),
    )
    expect(ensureStrykerVitest5Compat(ROOT, upstreamMixed.io)).toEqual({
      status: "unrecognised",
      vitestVersion: "5.0.3",
      patched: [],
    })
    expect(upstreamMixed.writes).toEqual([])

    const unknown = memoryIo(install("5.0.3", "something else entirely", legacy("s")))
    expect(ensureStrykerVitest5Compat(ROOT, unknown.io).status).toBe("unrecognised")
    expect(unknown.writes).toEqual([])

    const bothUnknown = memoryIo(install("5.0.3", "x", "y"))
    expect(ensureStrykerVitest5Compat(ROOT, bothUnknown.io).status).toBe("unrecognised")
  })

  it("finds Vitest and the runner hoisted in an ancestor, and leaves a runner outside the project alone", () => {
    const hoisted = (file: string) =>
      file.replace(path.join(ROOT, "node_modules"), path.join(FS_ROOT, "work", "node_modules"))
    const files = Object.fromEntries(
      Object.entries(install("5.0.3", legacy("h"), legacy("s"))).map(([file, text]) => [
        hoisted(file),
        text,
      ]),
    )
    const { io, writes } = memoryIo(files)
    const result = ensureStrykerVitest5Compat(path.join(ROOT, "packages", "a"), io)
    expect(result).toEqual({
      status: "outside-project",
      vitestVersion: "5.0.3",
      patched: [],
      runnerDir: hoisted(RUNNER),
    })
    expect(writes).toEqual([])
  })

  it("patches a runner whose realpath is inside the project, and refuses one whose realpath is not", () => {
    const inside = memoryIo(install("5.0.3", legacy("h"), legacy("s")))
    const realpaths: string[] = []
    const result = ensureStrykerVitest5Compat(ROOT, {
      ...inside.io,
      realpath: (file: string) => {
        realpaths.push(file)
        return file
      },
    })
    expect(result.status).toBe("patched")
    expect(realpaths).toEqual(expect.arrayContaining([ROOT, RUNNER]))

    const linked = memoryIo(install("5.0.3", legacy("h"), legacy("s")))
    const store = path.join(FS_ROOT, "store", "vitest-runner")
    const out = ensureStrykerVitest5Compat(ROOT, {
      ...linked.io,
      realpath: (file: string) => (file === RUNNER ? store : file),
    })
    expect(out).toMatchObject({ status: "outside-project", runnerDir: RUNNER })
    expect(linked.writes).toEqual([])
  })

  it("reports an outside runner that is already fixed or patched as it would any other", () => {
    const hoistedRoot = path.join(ROOT, "packages", "a")
    const fixed = memoryIo(install("5.0.3", "testNameSeparator", "testNameSeparator"))
    expect(ensureStrykerVitest5Compat(path.join(hoistedRoot), fixed.io).status).toBe(
      "upstream-fixed",
    )
    const done = memoryIo(install("5.0.3", patched("h"), patched("s")))
    expect(ensureStrykerVitest5Compat(hoistedRoot, done.io).status).toBe("already-patched")
  })

  it("leaves a runner hoisted into a parent node_modules untouched on the real file system", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "stryker-v5-compat-parent-"))
    try {
      const parentModules = path.join(sandbox, "node_modules")
      const runnerDist = path.join(
        parentModules,
        "@stryker-mutator",
        "vitest-runner",
        "dist",
        "src",
      )
      mkdirSync(runnerDist, { recursive: true })
      mkdirSync(path.join(parentModules, "vitest"), { recursive: true })
      writeFileSync(path.join(parentModules, "vitest", "package.json"), '{"version":"5.0.3"}')
      writeFileSync(
        path.join(parentModules, "@stryker-mutator", "vitest-runner", "package.json"),
        "{}",
      )
      writeFileSync(path.join(runnerDist, "test-helpers.js"), legacy("parent helpers"))
      writeFileSync(path.join(runnerDist, "stryker-setup.js"), legacy("parent setup"))
      writeFileSync(path.join(parentModules, "canary.txt"), "alive")
      const project = path.join(sandbox, "project")
      mkdirSync(project)

      const result = ensureStrykerVitest5Compat(project)

      expect(result).toMatchObject({ status: "outside-project", patched: [] })
      expect(result.runnerDir).toBe(path.join(parentModules, "@stryker-mutator", "vitest-runner"))
      expect(readFileSync(path.join(runnerDist, "test-helpers.js"), "utf8")).toBe(
        legacy("parent helpers"),
      )
      expect(readFileSync(path.join(runnerDist, "stryker-setup.js"), "utf8")).toBe(
        legacy("parent setup"),
      )
      expect(readFileSync(path.join(parentModules, "canary.txt"), "utf8")).toBe("alive")
      expect(readdirSync(runnerDist).sort()).toEqual(["stryker-setup.js", "test-helpers.js"])
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it("leaves a runner symlinked in from outside the project untouched on the real file system", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "stryker-v5-compat-link-"))
    try {
      const store = path.join(sandbox, "store", "vitest-runner")
      mkdirSync(path.join(store, "dist", "src"), { recursive: true })
      writeFileSync(path.join(store, "package.json"), "{}")
      writeFileSync(path.join(store, "dist", "src", "test-helpers.js"), legacy("store helpers"))
      writeFileSync(path.join(store, "dist", "src", "stryker-setup.js"), legacy("store setup"))
      const project = path.join(sandbox, "project")
      mkdirSync(path.join(project, "node_modules", "vitest"), { recursive: true })
      mkdirSync(path.join(project, "node_modules", "@stryker-mutator"), { recursive: true })
      writeFileSync(
        path.join(project, "node_modules", "vitest", "package.json"),
        '{"version":"5.0.3"}',
      )
      symlinkSync(
        store,
        path.join(project, "node_modules", "@stryker-mutator", "vitest-runner"),
        "dir",
      )

      expect(ensureStrykerVitest5Compat(project).status).toBe("outside-project")
      expect(readFileSync(path.join(store, "dist", "src", "test-helpers.js"), "utf8")).toBe(
        legacy("store helpers"),
      )
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it("reads and writes the real file system when no io is given", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stryker-v5-compat-"))
    try {
      const runnerDist = path.join(
        dir,
        "node_modules",
        "@stryker-mutator",
        "vitest-runner",
        "dist",
        "src",
      )
      mkdirSync(runnerDist, { recursive: true })
      mkdirSync(path.join(dir, "node_modules", "vitest"), { recursive: true })
      writeFileSync(path.join(dir, "node_modules", "vitest", "package.json"), '{"version":"5.0.3"}')
      writeFileSync(
        path.join(dir, "node_modules", "@stryker-mutator", "vitest-runner", "package.json"),
        "{}",
      )
      writeFileSync(path.join(runnerDist, "test-helpers.js"), legacy("real helpers"))
      writeFileSync(path.join(runnerDist, "stryker-setup.js"), legacy("real setup"))

      const result = ensureStrykerVitest5Compat(dir)

      expect(result.status).toBe("patched")
      expect(readFileSync(path.join(runnerDist, "test-helpers.js"), "utf8")).toBe(
        patched("real helpers"),
      )
      expect(readFileSync(path.join(runnerDist, "stryker-setup.js"), "utf8")).toBe(
        patched("real setup"),
      )
      expect(ensureStrykerVitest5Compat(dir).status).toBe("already-patched")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("isStrictlyInside", () => {
  const at = (...parts: string[]) => path.join(FS_ROOT, ...parts)

  it("holds for a path below the directory", () => {
    expect(isStrictlyInside(at("a"), at("a", "b"))).toBe(true)
    expect(isStrictlyInside(at("a"), at("a", "b", "c"))).toBe(true)
    // A name that starts with two dots is a child, not the parent.
    expect(isStrictlyInside(at("a"), at("a", "..b"))).toBe(true)
  })

  it("fails for the directory itself, its parent, a sibling and anything above", () => {
    expect(isStrictlyInside(at("a"), at("a"))).toBe(false)
    expect(isStrictlyInside(at("a", "b"), at("a"))).toBe(false)
    expect(isStrictlyInside(at("a", "b"), at("a", "c"))).toBe(false)
    expect(isStrictlyInside(at("a", "b"), FS_ROOT)).toBe(false)
    expect(isStrictlyInside(at("a"), at("ab"))).toBe(false)
  })
})
