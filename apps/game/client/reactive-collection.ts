import type { ReadonlyAtom } from "@mp/state";
import type { DestroyOptions } from "pixi.js";
import { Container } from "pixi.js";

export class ReactiveCollection<T> extends Container {
  private unsubscribe: () => void;

  constructor(
    private items: ReadonlyAtom<T[]>,
    private createItem: (item: T) => Container,
  ) {
    super();
    this.unsubscribe = reactiveCollectionBinding(this, items, createItem);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this.unsubscribe();
  }
}

export function reactiveCollectionBinding<Item>(
  container: Container,
  items: ReadonlyAtom<Item[]>,
  createElement: (item: Item) => Container,
) {
  const elementsByItem = new Map<Item, Container>();
  return items.subscribe((newList, oldList) => {
    const newItems = new Set(newList);
    const oldItems = new Set(oldList);
    const addedItems = newItems.difference(oldItems);
    const removedItems = oldItems.difference(newItems);

    for (const item of addedItems) {
      const element = createElement(item);
      elementsByItem.set(item, element);
      container.addChild(element);
    }

    for (const item of removedItems) {
      const element = elementsByItem.get(item);
      if (element) {
        container.removeChild(element);
      }
      elementsByItem.delete(item);
    }
  });
}
