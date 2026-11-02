import { required } from "./required.js"

/**
 * Remembers what a function returned for each distinct set of arguments. A result of `undefined`
 * is remembered too, so it is never computed twice.
 * @param compute - The function to remember. Its arguments must survive `JSON.stringify`.
 * @returns A function that gives the same answers, computing each one once.
 */
export function memoizeBy<Args extends readonly unknown[], Result>(
  compute: (...args: Args) => Result,
): (...args: Args) => Result {
  const results = new Map<string, Result>()
  return (...args) => {
    const key = JSON.stringify(args)
    if (!results.has(key)) {
      results.set(key, compute(...args))
    }
    return required(results, key)
  }
}

/**
 * Adds a value to the list stored under a key, starting the list if there is none.
 * @param map - The lists by key.
 * @param key - Which list.
 * @param value - What to add to its end.
 */
export function append<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value): void {
  map.set(key, [...(map.get(key) ?? []), value])
}

/**
 * @param map - Lists by key.
 * @param key - Which list.
 * @returns The list stored under the key, or an empty one.
 */
export function valuesOf<Key, Value>(
  map: ReadonlyMap<Key, readonly Value[]>,
  key: Key,
): readonly Value[] {
  return map.get(key) ?? new Array<Value>()
}

/**
 * @param items - A list, or nothing.
 * @returns The list, or an empty one when there is none.
 */
export function listOf<Item>(items: readonly Item[] | undefined): readonly Item[] {
  return items ?? new Array<Item>()
}
