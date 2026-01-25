/** @gqlType */
export interface MapChanges<Key, Value> {
  /** @gqlField */
  added?: MapAddition<Key, Value>[] | null;
  /** @gqlField */
  removed?: Key[] | null;
}

/** @gqlType */
export interface MapAddition<Key, Value> {
  /** @gqlField */
  key: Key;
  /** @gqlField */
  value: Value;
}

export function applyMapChanges<Key, Value>(
  prev: ReadonlyMap<Key, Value>,
  changes: MapChanges<Key, Value>,
): ReadonlyMap<Key, Value> {
  const map = new Map(prev);
  if (changes?.removed) {
    for (const id of changes.removed) {
      map.delete(id);
    }
  }
  if (changes?.added) {
    for (const add of changes.added) {
      map.set(add.key, add.value);
    }
  }
  return map;
}
