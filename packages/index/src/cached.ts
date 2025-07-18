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
    let result: Set<Item> | undefined;
    for (const key in query) {
      const matches = this.caches[key].get(query[key] as never);
      if (!matches) {
        return emptySet;
      } else if (!result) {
        result = matches;
      } else {
        result = result.intersection(matches);
      }
    }
    return result ?? emptySet;
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
