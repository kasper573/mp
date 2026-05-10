import type { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import { InventoryRef } from "./components";
import type { ItemInstance } from "./views";
import { readItemInstance } from "./views";

export function inventorySignal(
  world: ReactiveWorld,
  inventoryId: ReadonlySignal<string | undefined>,
): ReadonlySignal<readonly ItemInstance[]> {
  const refs = world.signal.query(InventoryRef);
  return computed(() => {
    const inv = inventoryId.value;
    if (!inv) return [];
    const result: ItemInstance[] = [];
    for (const [id, ref] of refs.value) {
      if (ref.inventoryId !== inv) continue;
      const item = readItemInstance(world, id);
      if (item) result.push(item);
    }
    return result;
  });
}
