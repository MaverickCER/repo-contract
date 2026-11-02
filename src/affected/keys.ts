/**
 * String keys for the facts the affected analysis derives. They double as provenance: each fact is
 * recorded with the key of the fact that caused it, so a test's presence in the affected set can be
 * walked back to a changed file (see `explainAffected`).
 */

/**
 * Key for a file that differs from the base.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const changedKey = (file: string): string => `changed:${file}`

/**
 * Key for a top-level name inside `file` whose behavior may differ.
 * @param file - Repo-relative path.
 * @param name - The top-level name.
 * @returns The key.
 */
export const localKey = (file: string, name: string): string => `local:${file}#${name}`

/**
 * Key for an exported name of `file` whose behavior may differ.
 * @param file - Repo-relative path.
 * @param name - The exported name.
 * @returns The key.
 */
export const exportKey = (file: string, name: string): string => `export:${file}#${name}`

/**
 * Key for every export of `file`, used when it changed in a way the analysis cannot attribute to one name.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const allKey = (file: string): string => `all:${file}`

/**
 * Key for "any export of `file` changed" -- what namespace and bare imports of it care about.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const anyKey = (file: string): string => `any:${file}`

/**
 * Key for a test entry that must run.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const testKey = (file: string): string => `test:${file}`

/**
 * Key for a module that loads code by a non-literal specifier, so it is affected by any change.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const opaqueKey = (file: string): string => `opaque:${file}`

/**
 * Key for a source file that depends on a changed symbol.
 * @param file - Repo-relative path.
 * @returns The key.
 */
export const sourceKey = (file: string): string => `source:${file}`

/**
 * Renders one provenance key as a short sentence fragment.
 * @param key - A key produced by one of the key functions in this module.
 * @returns A human-readable description.
 */
export function describeKey(key: string): string {
  const separator = key.indexOf(":")
  const kind = key.slice(0, separator)
  const rest = key.slice(separator + 1)
  switch (kind) {
    case "changed":
      return `${rest} changed`
    case "local": {
      const [file, name] = splitSymbol(rest)
      return `\`${name}\` in ${file} changed`
    }
    case "export": {
      const [file, name] = splitSymbol(rest)
      return `${file} exports a changed \`${name}\``
    }
    case "all":
      return `${rest} changed in a way that may affect every export`
    case "any":
      return `${rest} has a changed export`
    case "test":
      return `${rest} must run`
    case "opaque":
      return `${rest} loads modules dynamically, so it is treated as affected by any change`
    case "source":
      return `${rest} depends on a changed symbol`
    default:
      return key
  }
}

/**
 *
 * @param rest
 */
/**
 * Splits `file#name` at its last `#`.
 * @param rest - The part of a key after its kind.
 * @returns The file and the name.
 */
function splitSymbol(rest: string): readonly [string, string] {
  const hash = rest.lastIndexOf("#")
  return [rest.slice(0, hash), rest.slice(hash + 1)]
}
