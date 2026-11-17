// Patches `@stryker-mutator/vitest-runner` inside the project's `node_modules`, so Stryker works
// with Vitest 5 until a runner release carries the upstream fix.
//
// Why: Vitest 5 matches `testNamePattern` against the suite chain and test name joined by ` > `
// (https://vitest.dev/guide/migration/). The runner joins them with a single space, so the pattern
// matches nothing. Every mutant with per-test coverage then runs zero tests and survives. The
// `Mutation` check fails with a report in which nothing is killed. Upstream tracks it as
// stryker-mutator/stryker-js#6210.
//
// What: one expression, in the two runner files that build and record test names,
// `dist/src/test-helpers.js` and `dist/src/stryker-setup.js`:
//
//   nameParts.join(' ').trim()   ->   nameParts.join(' > ').trim()
//
// When: `repo-contract mutation run` applies it before Stryker starts. Vitest 5 or later and the
// runner must both be installed, and both files must carry the old expression. It never applies
// twice. Only an install whose realpath is inside the project is patched. One hoisted to a parent
// directory or linked in from outside is left untouched. The run prints a note naming it.
//
// A runner that already injects `testNameSeparator` has the upstream fix and is left alone. A
// runner this file does not recognise is also left alone. So is one with a runner file it cannot
// read, or a Vitest whose package.json it cannot parse. The run reports each, so a run with zero
// kills has a named cause. Each file is rewritten atomically, through a temporary file and a
// rename.
//
// Opt-out: `mutation run --no-patch-vitest-runner`, or `mutation({ patchVitestRunner: false })`,
// leaves `node_modules` as installed. Ported from internal-package-contract's
// scripts/stryker-vitest5-compat.mjs.

import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

/** The expression the runner ships with. */
export const LEGACY_JOIN = "nameParts.join(' ').trim()"

/** The same expression with the separator Vitest 5 matches on. */
export const VITEST_5_JOIN = "nameParts.join(' > ').trim()"

/** A name only the upstream fix introduces; its presence means the runner needs no help. */
export const UPSTREAM_FIX_MARKER = "testNameSeparator"

// Runner 10.1.1 injects that name in stryker-setup.js only. Its test-helpers.js takes the
// separator as a parameter instead and names the Vitest 5 one with this constant.
const UPSTREAM_FIX_MARKERS = [UPSTREAM_FIX_MARKER, "VITEST_MODERN_TEST_NAME_SEPARATOR"]

/** The runner files, relative to the directory of its entry point, that build or record test names. */
export const RUNNER_FILES = ["test-helpers.js", "stryker-setup.js"]

/**
 * A temporary path beside `file`, on the same filesystem so renaming it into place is atomic.
 * @param {string} file - the file about to be rewritten.
 * @param {number} pid - the current process id, so concurrent runs do not share a temporary file.
 * @returns {string} the temporary path.
 */
export function tempPathFor(file, pid) {
  return `${file}.${String(pid)}.tmp`
}

/**
 * Rewrites a file without ever leaving it half-written: the new text goes to a temporary file first and is
 * renamed over the target. So a crash mid-write cannot leave a truncated runner file that would no longer be
 * recognised (and so never fixed again) until someone reinstalled it.
 * @param {string} file - the file to rewrite.
 * @param {string} text - its new contents.
 * @param {{ write: (file: string, text: string) => void, rename: (from: string, to: string) => void }} ops - file
 *   operations; defaults to the real ones.
 * @returns {void}
 */
export function writeFileAtomically(
  file,
  text,
  ops = { write: (target, contents) => writeFileSync(target, contents), rename: renameSync },
) {
  const temp = tempPathFor(file, process.pid)
  ops.write(temp, text)
  ops.rename(temp, file)
}

/**
 * @param {string} version - a semver string such as `5.0.3`.
 * @returns {number | undefined} its major number, or undefined when it does not start with one.
 */
export function majorOf(version) {
  const match = /^(\d+)\./.exec(version)
  return match === null ? undefined : Number(match[1])
}

/**
 * @param {string} text - the contents of one runner file.
 * @returns {"patched" | "needs-patch" | "upstream-fixed" | "unrecognised"} what state that file is in.
 */
export function classify(text) {
  if (text.includes(VITEST_5_JOIN)) return "patched"
  if (text.includes(LEGACY_JOIN)) return "needs-patch"
  if (UPSTREAM_FIX_MARKERS.some((marker) => text.includes(marker))) return "upstream-fixed"
  return "unrecognised"
}

/**
 * Every directory from `cwd` up to the filesystem root, nearest first.
 * Built as a finite list from the path's own segments, so walking it cannot run unbounded.
 * @param {string} cwd - where to start.
 * @returns {string[]} the directories.
 */
export function ancestorsOf(cwd) {
  const absolute = path.resolve(cwd)
  const { root } = path.parse(absolute)
  const relative = path.relative(root, absolute)
  const segments = relative === "" ? [] : relative.split(path.sep)
  return Array.from({ length: segments.length + 1 }, (_, up) =>
    path.join(root, ...segments.slice(0, segments.length - up)),
  )
}

/**
 * Walks up from a directory the way Node resolves packages, and returns the first install of `name`.
 * Done by hand because the runner is ESM-only, so `require.resolve` cannot reach it.
 * @param {string} cwd - where to start.
 * @param {string} name - the package name, e.g. `vitest` or `@stryker-mutator/vitest-runner`.
 * @param {(file: string) => boolean} exists - whether a path exists.
 * @returns {string | undefined} the package's directory, or undefined when no ancestor has it.
 */
export function findPackageDir(cwd, name, exists) {
  return ancestorsOf(cwd)
    .map((dir) => path.join(dir, "node_modules", name))
    .find((candidate) => exists(path.join(candidate, "package.json")))
}

/**
 * @typedef {object} CompatIo
 * @property {(file: string) => boolean} exists
 * @property {(file: string) => string} readFile
 * @property {(file: string, text: string) => void} writeFile
 * @property {(file: string) => string} [realpath] - Resolves symbolic links; identity when absent.
 */

/**
 * @typedef {object} CompatResult
 * @property {"not-needed" | "patched" | "already-patched" | "upstream-fixed" | "unrecognised" | "outside-project"} status
 * @property {string | undefined} vitestVersion - the installed Vitest version, when there is one.
 * @property {string[]} patched - the runner files this call rewrote.
 * @property {string} [runnerDir] - with `outside-project`, the install that needed the patch.
 * @property {string} [unreadable] - with `unrecognised`, the first file that could not be read or
 *   parsed.
 */

/**
 * @param {string} parent - A directory.
 * @param {string} child - A path.
 * @returns {boolean} Whether `child` lies strictly inside `parent`. Neither is resolved through
 *   symbolic links: pass realpaths to compare where they lead.
 */
export function isStrictlyInside(parent, child) {
  const relative = path.relative(parent, child)
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

/**
 * @param {CompatIo} io - File access.
 * @param {string} file - A file to read.
 * @returns {string | null} Its text, or `null` when it cannot be read.
 */
function readOrNull(io, file) {
  try {
    return io.readFile(file)
  } catch {
    return null
  }
}

/**
 * Brings the installed Stryker Vitest runner in line with Vitest 5 when it needs it.
 * @param {string} cwd - the project root whose `node_modules` hold Vitest and the runner.
 * @param {CompatIo} io - file access; defaults to the real file system.
 * @returns {CompatResult} what was found and what was done.
 */
export function ensureStrykerVitest5Compat(
  cwd,
  io = {
    exists: existsSync,
    readFile: (file) => readFileSync(file, "utf8"),
    writeFile: writeFileAtomically,
    realpath: realpathSync,
  },
) {
  const vitestDir = findPackageDir(cwd, "vitest", io.exists)
  const runnerDir = findPackageDir(cwd, "@stryker-mutator/vitest-runner", io.exists)
  if (vitestDir === undefined || runnerDir === undefined) {
    return { status: "not-needed", vitestVersion: undefined, patched: [] }
  }

  const vitestManifest = path.join(vitestDir, "package.json")
  let vitestVersion
  try {
    vitestVersion = JSON.parse(io.readFile(vitestManifest)).version
  } catch {
    // A half-written install cannot say which Vitest it is, so the runner is left as it is.
    return {
      status: "unrecognised",
      vitestVersion: undefined,
      patched: [],
      unreadable: vitestManifest,
    }
  }
  const major = majorOf(vitestVersion)
  if (major === undefined || major < 5) return { status: "not-needed", vitestVersion, patched: [] }

  const files = RUNNER_FILES.map((name) => path.join(runnerDir, "dist", "src", name))
  const texts = files.map((file) => readOrNull(io, file))
  const unreadable = files.find((_, index) => texts[index] === null)
  if (unreadable !== undefined) {
    return { status: "unrecognised", vitestVersion, patched: [], unreadable }
  }
  const states = texts.map(classify)

  if (states.every((state) => state === "upstream-fixed")) {
    return { status: "upstream-fixed", vitestVersion, patched: [] }
  }
  if (states.every((state) => state === "patched")) {
    return { status: "already-patched", vitestVersion, patched: [] }
  }
  // Rewrite only when every file is one we understand. Patching one of two would leave two things
  // out of step: the names the setup file records, and the pattern the runner builds from them.
  if (!states.every((state) => state === "patched" || state === "needs-patch")) {
    return { status: "unrecognised", vitestVersion, patched: [] }
  }

  // Node resolves the runner from ancestors too, so the install found may belong to another
  // project. Only an install whose realpath is inside this one is rewritten.
  const realpath = io.realpath ?? ((file) => file)
  if (!isStrictlyInside(realpath(cwd), realpath(runnerDir))) {
    return { status: "outside-project", vitestVersion, patched: [], runnerDir }
  }

  const patched = []
  files.forEach((file, index) => {
    if (states[index] !== "needs-patch") return
    io.writeFile(file, texts[index].replace(LEGACY_JOIN, VITEST_5_JOIN))
    patched.push(file)
  })
  return { status: "patched", vitestVersion, patched }
}
