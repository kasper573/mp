import type { ReadonlySignal } from "@mp/state";
import { computed } from "@mp/state";

export class Index<Item, Definition extends IndexDefinition> {
  #computedIndexes: IndexSignals<Item, Definition>;
  #computedQueries = new Map<string, ReadonlySignal<ReadonlySet<Item>>>();

  constructor(
    private dataSource: () => Iterable<Item>,
    private resolvers: IndexResolvers<Item, Definition>,
  ) {
    this.#computedIndexes = Object.keys(resolvers).reduce(
      (acc, key) => {
        acc[key as keyof typeof acc] = computed(() => this.resolveIndex(key));
        return acc;
      },
      {} as IndexSignals<Item, Definition>,
    );
  }

  /**
   * Selects the items matching the given query.
   * The query is accumulative, meaning that the returned items must match all constraints in the given query.
   */
  access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): ReadonlySet<NarrowedItem> {
    const key = queryKey(query);
    let computation = this.#computedQueries.get(key);
    if (!computation) {
      computation = computed(() => this.resolveQuery(query));
      this.#computedQueries.set(key, computation);
      // oxlint-disable-next-line no-console
      console.log("Created computation #", this.#computedQueries.size);
    }

    return computation.value as ReadonlySet<NarrowedItem>;
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
      items.add(item);
    }
    return map;
  }

  private resolveQuery<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Set<NarrowedItem> {
    const queryEntries = Object.entries(query);

    // Gather each constraints candidate set
    const candidateSets: Set<Item>[] = [];
    for (const [key, value] of queryEntries) {
      const bucket = this.#computedIndexes[key].value.get(value);
      if (!bucket) {
        // all constraints must match, any mismatch means no results.
        return emptySet as Set<NarrowedItem>;
      }
      candidateSets.push(bucket);
    }

    // Smallest first for performance, can filter by the others
    candidateSets.sort((a, b) => a.size - b.size);

    const [smallest, ...others] = candidateSets;

    let intersection = smallest;
    for (const set of others) {
      intersection = intersection.intersection(set);
    }

    return intersection as Set<NarrowedItem>;
  }
}

function queryKey(query: IndexQuery<IndexDefinition>): string {
  let parts = [];
  for (const prop in query) {
    parts.push(prop);
    parts.push(query[prop]);
  }
  return parts.join("_");
}

const emptySet = Object.freeze(new Set<unknown>()) as Set<unknown>;

type IndexHash<HashValue, Item> = ReadonlyMap<HashValue, Set<Item>>;

type IndexSignals<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: ReadonlySignal<IndexHash<Definition[K], Item>>;
};

export type IndexResolvers<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: (item: Item) => Definition[K];
};

export type IndexDefinition = Record<string, unknown>;

export type IndexQuery<Definition extends IndexDefinition> =
  Partial<Definition>;
