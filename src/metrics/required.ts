/**
 * Reads a key that the caller has just listed from the same map, so it is always there. Typed
 * rather than asserted: a missing key would be a bug in the caller, not an input to handle.
 * @param map - The map to read.
 * @param key - A key taken from `map`.
 * @returns The value stored for `key`.
 */
export function required<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  return map.get(key) as V
}
