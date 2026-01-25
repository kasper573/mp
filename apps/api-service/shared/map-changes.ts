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
