export class Index<Item, Definition extends IndexDefinition> {
  private caches: IndexCache<Item, Definition>;

  constructor(
    protected dataSource: () => Iterable<Item>,
    protected resolvers: IndexResolvers<Item, Definition>,
  ) {
    this.caches = createCaches(Object.keys(resolvers));
  }

  access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): ReadonlySet<NarrowedItem> {
    const entries = Object.entries(query) as [
      keyof typeof query,
      Definition[keyof Definition],
    ][];
    if (entries.length === 0) return emptySet;

    // 1. Pull out all matching sets (bail out early if any are empty).
    const sets: Set<Item>[] = [];
    for (const [key, val] of entries) {
      const s = this.caches[key].get(val as never);
      if (!s) return emptySet;
      sets.push(s);
    }

    // 2. Sort by ascending size so we intersect the smallest first.
    sets.sort((a, b) => a.size - b.size);

    // 3. Clone the smallest set and filter it in-place against the rest.
    const result = new Set<Item>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      const s = sets[i];
      for (const item of result) {
        if (!s.has(item)) {
          result.delete(item);
        }
      }
      if (result.size === 0) return emptySet; // shortcut if intersection is empty
    }

    return result as ReadonlySet<unknown> as ReadonlySet<NarrowedItem>;
  }

  build() {
    const items = Array.from(this.dataSource());
    for (const key in this.resolvers) {
      const resolve = this.resolvers[key];
      const cache = (this.caches[key] ??= new Map());
      for (const item of items) {
        const value = resolve(item);
        if (cache.has(value)) {
          // oxlint-disable-next-line no-non-null-assertion
          cache.get(value)!.add(item);
        } else {
          cache.set(value, new Set([item]));
        }
      }
    }
  }

  clear() {
    for (const key in this.caches) {
      this.caches[key].clear();
    }
  }
}

// oxlint-disable-next-line no-explicit-any
const emptySet: ReadonlySet<any> = new Set();

function createCaches<Item, Definition extends IndexDefinition>(
  keys: Array<keyof Definition>,
): IndexCache<Item, Definition> {
  const caches: Partial<IndexCache<Item, Definition>> = {};
  for (const key of keys) {
    caches[key] = new Map();
  }
  return caches as IndexCache<Item, Definition>;
}

export type IndexResolvers<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: (item: Item) => Definition[K];
};

export type IndexDefinition = Record<string, unknown>;

export type IndexQuery<Definition extends IndexDefinition> =
  Partial<Definition>;

export type IndexCache<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: Map<Definition[K], Set<Item>>;
};
