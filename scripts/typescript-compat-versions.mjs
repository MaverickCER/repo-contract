// The TypeScript releases scripts/typescript-compat.mjs type-checks the packed tarball under. The
// first entry is the floor of package.json's optional `typescript` peer, so CI proves the oldest
// release the peer range admits. test/unit/scripts/typescript-compat-versions.test.ts fails when
// the peer floor and this list disagree.
//
// The floor is 5.8. Under 5.0 to 5.7, a CommonJS consumer with `module: "nodenext"` fails with
// TS1479. Each `dist/*.d.cts` re-exports an ES module, and 5.8 is the first release to allow it.

/** The oldest TypeScript release the `typescript` peer range admits, as `<major>.<minor>`. */
export const TYPESCRIPT_FLOOR = "5.8"

/** The floor, then the newest release of each major a consumer may have installed. */
export const TYPESCRIPT_COMPAT_VERSIONS = [TYPESCRIPT_FLOOR, "5", "6", "7"]

/**
 * The floor of a `>=<major>.<minor>.<patch>` range.
 * @param {string} range - a package.json range, such as `peerDependencies.typescript`.
 * @returns {string} the floor as `<major>.<minor>`.
 */
export function rangeFloor(range) {
  const match = /^>=(\d+)\.(\d+)\.\d+$/.exec(range)
  if (match === null) {
    throw new Error(`Expected a ">=<major>.<minor>.<patch>" range; got ${JSON.stringify(range)}.`)
  }
  return `${match[1]}.${match[2]}`
}

/**
 * The `@types/node` version to install for one compat version. A pinned `<major>.<minor>` release
 * gets the Node.js floor's types (`22` for `>=22.0.0`). The newest `@types/node` clashes with an
 * older 5.x's DOM library. A bare major gets `latest`.
 * @param {string} version - an entry of TYPESCRIPT_COMPAT_VERSIONS.
 * @param {string} enginesNode - package.json's `engines.node`.
 * @returns {string} the version or dist-tag to install.
 */
export function nodeTypesFor(version, enginesNode) {
  return version.includes(".") ? rangeFloor(enginesNode).split(".")[0] : "latest"
}
