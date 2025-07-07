import type { ReadonlyAtom } from "@mp/state";
import type { DestroyOptions } from "pixi.js";
import { Container } from "pixi.js";

export class ReactiveCollection<Item> extends Container {
  private unsubscribe: () => void;

  constructor(
    items: ReadonlyAtom<Iterable<Item>>,
    createElement: (item: Item) => Container,
  ) {
    super();
    this.unsubscribe = reactiveCollectionBinding(this, items, createElement);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this.unsubscribe();
  }
}

/**
 * Automatically creates or removes pixi elements in the given container.
 * The elements are derived from the given reactive list.
 * When the list changes, it adds or removes elements in the container.
 * Recognized items are not recreated and keep their existing elements.
 * Items are identified by reference equality.
 */
export function reactiveCollectionBinding<Item>(
  container: Container,
  items: ReadonlyAtom<Iterable<Item>>,
  createElement: (item: Item) => Container,
) {
  const elementsByItem = new Map<Item, Container>();
  const unsubscribe = items.subscribe((newList, oldList) => {
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
        element.destroy();
        container.removeChild(element);
      }
      elementsByItem.delete(item);
    }
  });

  return function cleanupCollectionBinding() {
    unsubscribe();
    for (const element of elementsByItem.values()) {
      element.destroy();
      container.removeChild(element);
    }
    elementsByItem.clear();
  };
}
