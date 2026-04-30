import type { Cleanup } from "@rift/module";
import { RiftServerModule } from "@rift/core";
import type { ItemDefinition } from "./definitions";

export interface ItemSpawnOptions {
  readonly items: ReadonlyArray<ItemDefinition>;
}

export class ItemSpawnModule extends RiftServerModule {
  readonly #items: ReadonlyArray<ItemDefinition>;

  constructor(opts: ItemSpawnOptions) {
    super();
    this.#items = opts.items;
  }

  init(): Cleanup {
    void this.#items;
    return () => {};
  }
}
