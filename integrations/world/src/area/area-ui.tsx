import * as styles from "./area-ui.css";
import { useRift } from "../client";
import { useItemDefinition } from "../renderer/context";
import { RespawnDialog } from "../character/respawn-dialog";
import type {
  ConsumableInstanceView,
  EquipmentInstanceView,
} from "../inventory/views";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { EntityId } from "@rift/core";
import { inventorySignal } from "../inventory/signals";
import { Combat } from "../combat/components";
import { InventoryRef } from "../inventory/components";
import { Suspense, type ReactElement } from "preact/compat";

export interface AreaUiProps {
  characterEntity: ReadonlySignal<EntityId | undefined>;
}

export function AreaUi({ characterEntity }: AreaUiProps) {
  const isDead = useRift((c) =>
    computed(() => {
      const id = characterEntity.value;
      if (id === undefined) return true;
      return !c.world.signal.get(id, Combat).value?.alive;
    }),
  );
  return (
    <>
      <Inventory characterEntity={characterEntity} />
      <RespawnDialog open={isDead} />
    </>
  );
}

function Inventory({ characterEntity }: AreaUiProps) {
  const items = useRift((c) => {
    const inventoryId = computed(() => {
      const id = characterEntity.value;
      if (id === undefined) return undefined;
      return c.world.signal.get(id, InventoryRef).value?.inventoryId;
    });
    return inventorySignal(c.world, inventoryId);
  });

  return (
    <div className={styles.inventory}>
      <div className={styles.itemGrid}>
        {items.map((item): ReactElement => {
          switch (item.type) {
            case "equipment":
              return (
                <Suspense key={item.id} fallback={<LoadingTile />}>
                  <EquipmentTile item={item} />
                </Suspense>
              );
            case "consumable":
              return (
                <Suspense key={item.id} fallback={<LoadingTile />}>
                  <ConsumableTile item={item} />
                </Suspense>
              );
          }
        })}
      </div>
      <div className={styles.label}>Inventory</div>
    </div>
  );
}

function ConsumableTile({ item }: { item: ConsumableInstanceView }) {
  const def = useItemDefinition(item);
  return (
    <div className={styles.itemTile({ type: "consumable" })}>
      {def.name} x {item.stackSize}/{def.maxStackSize}
    </div>
  );
}

function EquipmentTile({ item }: { item: EquipmentInstanceView }) {
  const def = useItemDefinition(item);
  return (
    <div className={styles.itemTile({ type: "equipment" })}>
      {def.name} ({item.durability}/{def.maxDurability})
    </div>
  );
}

function LoadingTile() {
  return <div className={styles.itemTile({ type: "loading" })} />;
}
