/**
 * @module
 *
 * This module provides utility functions for [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
 */

/**
 * Get a value from a map with given key or insert into the map with provided default value if such key does not exists. This is similar to Python's `defaultdict`.
 *
 * @typedef TKey - Type for map keys.
 * @typedef TValue - Type for map values.
 * @param map - The map to get value from.
 * @param key - The key for which to find value for in the map.
 * @param defaultValue - A default value which will be registered with provided key and returned if no mapping for given key exists.
 * @returns Value bound under given key in the map or the default value.
 */
export function getOrInsertDefault<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  defaultValue: TValue
): TValue {
  let result = map.get(key);
  if (result === undefined) {
    map.set(key, (result = defaultValue));
  }
  return result;
}
