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

export function arrayShallowEquals<T>(a1: T[], a2: T[]): boolean {
  if (a1.length !== a2.length) {
    return false;
  }
  for (let i = 0; i < a1.length; i++) {
    if (a1[i] !== a2[i]) {
      return false;
    }
  }
  return true;
}

export function typedAssign<T extends object>(
  target: T,
  changes: Partial<T>,
): T {
  Object.assign(target, changes);
  return target;
}
