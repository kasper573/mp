export type TypedKeysFn = <T extends object>(obj: T) => Array<keyof T>;
export const typedKeys = Object.keys as TypedKeysFn;

export function upsertMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (map.has(key)) {
    map.get(key)?.push(value);
  } else {
    map.set(key, [value]);
  }
}

export function upsertMapSet<K, V>(
  map: Map<K, Set<V>>,
  key: K,
  value: V,
): void {
  if (map.has(key)) {
    map.get(key)?.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}
