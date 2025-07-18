import { Index, type IndexDefinition, type IndexQuery } from "./cached";

/**
 * An Index implementation that does not cache results and instead
 * always searches through the data source for every query.
 *
 * This mostly exists to allow for debugging and comparing performance
 * against the cached Index implementation.
 */
export class DisabledIndex<
  Item,
  Definition extends IndexDefinition,
> extends Index<Item, Definition> {
  override access<NarrowedItem extends Item>(
    query: IndexQuery<Definition>,
  ): ReadonlySet<NarrowedItem> {
    const matches = new Set<Item>();
    const all = Array.from(this.dataSource());
    for (const item of all) {
      const isMatch = Object.keys(query).every((key) => {
        return query[key] === this.resolvers[key](item);
      });
      if (isMatch) {
        matches.add(item);
      }
    }
    return matches as unknown as ReadonlySet<NarrowedItem>;
  }

  override build() {
    // noop
  }

  override clear() {
    // noop
  }
}
