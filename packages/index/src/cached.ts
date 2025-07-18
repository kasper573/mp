import type {
  IndexDefinition,
  Index,
  IndexCache,
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
    // initialize an empty Map for each definitional key
    this.caches = Object.keys(resolvers).reduce(
      (acc, key) => {
        acc[key] = new Map<Definition[typeof key], Set<Item>>();
        return acc;
      },
      {} as Record<string, Map<unknown, Set<Item>>>,
    ) as IndexCache<Item, Definition>;
  }

  build(): void {
    // reset master set and all per-key caches
    this.clear();
    for (const item of this.dataSource()) {
      this.allItems.add(item);
      // for each indexable field...
      for (const key of Object.keys(this.resolvers) as Array<
        keyof Definition
      >) {
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
    // clear each Map of value→Set<Item>
    for (const key of Object.keys(this.caches) as Array<keyof Definition>) {
      this.caches[key].clear();
    }
  }

  *access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem> {
    const entries = Object.entries(query) as [
      keyof Definition,
      Definition[keyof Definition],
    ][];
    if (entries.length === 0) {
      // no constraints ⇒ yield everything
      for (const item of this.allItems) {
        yield item as NarrowedItem;
      }
      return;
    }

    // gather each constraint's candidate set
    const candidateSets: Set<Item>[] = [];
    for (const [key, value] of entries) {
      const cacheForKey = this.caches[key];
      const bucket = cacheForKey.get(value);
      if (!bucket) {
        // nothing matches this constraint ⇒ empty result
        return;
      }
      candidateSets.push(bucket);
    }

    // pick the smallest set to iterate, and filter by the others
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
