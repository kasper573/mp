import type {
  Index,
  IndexDefinition,
  IndexQuery,
  IndexResolvers,
} from "./types";

/**
 * UncachedIndex is a simple implementation of the Index interface
 * that does not cache results. It is useful for debugging or to compare performance
 * between cached and uncached indices.
 */
export class UncachedIndex<Item, Definition extends IndexDefinition>
  implements Index<Item, Definition>
{
  constructor(
    protected dataSource: () => Iterable<Item>,
    protected resolvers: IndexResolvers<Item, Definition>,
  ) {}

  *access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): Generator<NarrowedItem> {
    const all = Array.from(this.dataSource());
    for (const item of all) {
      const isMatch = Object.keys(query).every((key) => {
        return query[key] === this.resolvers[key](item);
      });
      if (isMatch) {
        yield item as NarrowedItem;
      }
    }
  }

  build() {
    // noop
  }

  clear() {
    // noop
  }
}
