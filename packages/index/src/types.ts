export interface Index<Item, Definition extends IndexDefinition> {
  access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem>;

  build(): void;

  clear(): void;
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
