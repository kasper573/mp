import type { ReadonlySignal } from "@mp/state";
import { computed } from "@mp/state";
import type {
  IndexDefinition,
  Index,
  IndexResolvers,
  IndexQuery,
} from "./types";

export class ComputedIndex<Item, Definition extends IndexDefinition>
  implements Index<Item, Definition>
{
  private computedSignals: IndexSignals<Item, Definition>;

  constructor(
    private dataSource: () => Iterable<Item>,
    private resolvers: IndexResolvers<Item, Definition>,
  ) {
    this.computedSignals = Object.keys(resolvers).reduce(
      (acc, key) => {
        acc[key as keyof typeof acc] = computed(() => this.resolveIndex(key));
        return acc;
      },
      {} as IndexSignals<Item, Definition>,
    );
  }

  build(): void {
    // Noop
  }

  clear(): void {
    // Noop
  }

  private resolveIndex<K extends keyof Definition>(
    key: K,
  ): IndexHash<Definition[K], Item> {
    const map = new Map<Definition[K], Set<Item>>();
    for (const item of this.dataSource()) {
      const value = this.resolvers[key](item);
      let items = map.get(value);
      if (!items) {
        items = new Set<Item>();
        map.set(value, items);
      }
      {
        items.add(item);
      }
    }
    return map;
  }

  *access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem> {
    const queryEntries = Object.entries(query);
    if (queryEntries.length === 0) {
      throw new Error("Query must have at least one constraint.");
    }

    // Gather each constraints candidate set
    const candidateSets: Set<Item>[] = [];
    for (const [key, value] of queryEntries) {
      const bucket = this.computedSignals[key].value.get(value);
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

type IndexHash<HashValue, Item> = ReadonlyMap<HashValue, Set<Item>>;

type IndexSignals<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: ReadonlySignal<IndexHash<Definition[K], Item>>;
};
