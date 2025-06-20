import { clamp } from "@mp/math";

export interface SearchQuery<Filter, SortKey = never> {
  filter: Filter;
  pagination?: Pagination;
  sort?: Sort<SortKey>;
}

export type SimpleQueryQueryForItem<Item> = SearchQuery<
  SimpleFilter<Item>,
  SimpleSortKey<Item>
>;

export type SimpleFilter<Item> = Partial<Item>;

export type SimpleSortKey<Item> = keyof Item;

export interface Sort<SortKey> {
  key: SortKey;
  direction: SortDirection;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export type SortDirection = "asc" | "desc";

export interface SearchResult<Item> {
  items: Item[];
  total: number;
}

export function createSimpleFilter<Item>(): FilterFn<Item, SimpleFilter<Item>> {
  return (item, filter) => {
    for (const key in filter) {
      if (filter[key] !== item[key]) {
        return false;
      }
    }
    return true;
  };
}

export function createSimpleSortFactory<Item>(): SortFactory<
  Item,
  SimpleSortKey<Item>
> {
  return (sort) => {
    return (itemA, itemB) => {
      const aValue = itemA[sort.key];
      const bValue = itemB[sort.key];

      if (aValue < bValue) {
        return sort.direction === "asc" ? -1 : 1;
      } else if (aValue > bValue) {
        return sort.direction === "asc" ? 1 : -1;
      }
      return 0;
    };
  };
}

type SortFactory<Item, SortKey> = (
  sort: Sort<SortKey>,
) => (a: Item, b: Item) => number;

type FilterFn<Item, Filter> = (item: Item, filter: Filter) => boolean;

export function createPaginator<Item, Filter, SortKey>(
  filterFn: FilterFn<Item, Filter>,
  getCompareFn: SortFactory<Item, SortKey>,
) {
  return function paginateFromExistingCollection(
    allItems: ReadonlyArray<Item>,
    query: SearchQuery<Filter, SortKey>,
    maxPageSize: number,
  ): SearchResult<Item> {
    const { filter, pagination, sort } = query;

    let selectedItems = filter
      ? allItems.filter((item) => filterFn(item, filter))
      : allItems;

    if (sort) {
      const compareFn = getCompareFn(sort);
      selectedItems = selectedItems.toSorted(compareFn);
    }

    const page = pagination?.page ?? 1;
    const pageSize = clamp(
      pagination?.pageSize ?? allItems.length,
      0,
      maxPageSize,
    );

    const startIndex = (page - 1) * pageSize;
    const paginatedItems = selectedItems.slice(
      startIndex,
      startIndex + pageSize,
    );

    return {
      items: paginatedItems,
      total: selectedItems.length,
    };
  };
}
