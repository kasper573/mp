import { ReadonlyAtom } from "@mp/state";
import { Container, DestroyOptions } from "pixi.js";

export class ReactiveCollection<T> extends Container {
  private unsubscribe: () => void;

  constructor(
    private items: ReadonlyAtom<T[]>,
    private createItem: (item: T) => Container,
  ) {
    super();
    this.unsubscribe = this.items.subscribe(() => this.updateItems());
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this.unsubscribe();
  }

  private updateItems() {
    this.removeChildren();
    for (const item of this.items.get()) {
      const itemContainer = this.createItem(item);
      this.addChild(itemContainer);
    }
  }
}
