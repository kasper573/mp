import type {
  IndexDefinition,
  Index,
  IndexResolvers,
  IndexQuery,
} from "./types";

export class CachedIndex<Item, Definition extends IndexDefinition>
  implements Index<Item, Definition>
{
  private caches: IndexCache<Item, Definition>;
  private allItems = new Set<Item>();

  constructor(
    private dataSource: () => Iterable<Item>,
    private resolvers: IndexResolvers<Item, Definition>,
  ) {
    this.caches = Object.keys(resolvers).reduce(
      (acc, key) => {
        acc[key] = new Map();
        return acc;
      },
      {} as Record<string, Map<unknown, Set<Item>>>,
    ) as IndexCache<Item, Definition>;
  }

  build(): void {
    this.clear();
    for (const item of this.dataSource()) {
      this.allItems.add(item);

      for (const key in this.resolvers) {
        const value = this.resolvers[key](item);
        const cacheForKey = this.caches[key];
        let bucket = cacheForKey.get(value);
        if (!bucket) {
          bucket = new Set();
          cacheForKey.set(value, bucket);
        }
        bucket.add(item);
      }
    }
  }

  clear(): void {
    this.allItems.clear();
    for (const key in this.caches) {
      this.caches[key].clear();
    }
  }

  *access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem> {
    const entries = Object.entries(query);
    if (entries.length === 0) {
      throw new Error("Query must have at least one constraint.");
    }

    // Gather each constraints candidate set
    const candidateSets: Set<Item>[] = [];
    for (const [key, value] of entries) {
      const cacheForKey = this.caches[key];
      const bucket = cacheForKey.get(value);
      if (!bucket) {
        // all constraints must match, any mismatch means no results.
        return;
      }
      candidateSets.push(bucket);
    }

    // Pick the smallest set to iterate and filter by the others
    candidateSets.sort((a, b) => a.size - b.size);
    const [smallest, ...others] = candidateSets;

    for (const item of smallest) {
      let matchesAll = true;
      for (const set of others) {
        if (!set.has(item)) {
          matchesAll = false;
          break;
        }
      }
      if (matchesAll) {
        yield item as NarrowedItem;
      }
    }
  }
}

type IndexCache<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: Map<Definition[K], Set<Item>>;
};
