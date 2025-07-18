export interface Index<Item, Definition extends IndexDefinition> {
  /**
   * Selects the items matching the given query.
   * The query is accumulative, meaning that the returned items must match all constraints in the given query.
   * Should only return items from the cache and never access the data source.
   */
  access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem>;

  /**
   * Rebuilds all index caches by iterating over the data source
   * and grouping all items by the resolver values.
   * One cache is created for each key in the index definition.
   */
  build(): void;

  /**
   * Clears all index caches.
   */
  clear(): void;
}

export type IndexResolvers<Item, Definition extends IndexDefinition> = {
  [K in keyof Definition]: (item: Item) => Definition[K];
};

export type IndexDefinition = Record<string, unknown>;

export type IndexQuery<Definition extends IndexDefinition> =
  Partial<Definition>;
