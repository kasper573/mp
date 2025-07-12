import { disposableEffect, type ReadonlySignal } from "@mp/state";
import type { DestroyOptions } from "@mp/graphics";
import { Container } from "@mp/graphics";

export class ReactiveCollection<Item> extends Container {
  private unsubscribe: () => void;

  constructor(
    items: ReadonlySignal<Iterable<Item>>,
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
  items: ReadonlySignal<Iterable<Item>>,
  createElement: (item: Item) => Container,
) {
  const elementsByItem = new Map<Item, Container>();
  let prevItems = new Set<Item>();

  function updateElements() {
    const newItems = new Set(items.get());
    const addedItems = newItems.difference(prevItems);
    const removedItems = prevItems.difference(newItems);
    prevItems = newItems;

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
  }

  const unsubscribe = disposableEffect(updateElements);

  return function cleanupCollectionBinding() {
    unsubscribe();
    for (const element of elementsByItem.values()) {
      element.destroy();
      container.removeChild(element);
    }
    elementsByItem.clear();
  };
}
