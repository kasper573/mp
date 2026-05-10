import { useMemo } from "preact/hooks";
import * as styles from "./area-ui.css";
import { useItemDefinition, useRiftClient } from "../client/context";
import { RespawnDialog } from "../character/respawn-dialog";
import type {
  ConsumableInstanceView,
  EquipmentInstanceView,
} from "../client/views";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { EntityId } from "@rift/core";
import { inventorySignal } from "../client/signals";
import { Combat } from "../combat/components";
import { InventoryRef } from "../inventory/components";
import { Suspense, type ReactElement } from "preact/compat";

export interface AreaUiProps {
  characterEntity: ReadonlySignal<EntityId | undefined>;
}

export function AreaUi({ characterEntity }: AreaUiProps) {
  const client = useRiftClient();
  const isDead = useMemo(
    () =>
      computed(() => {
        const id = characterEntity.value;
        if (id === undefined) return true;
        const combat = client.world.signal.get(id, Combat).value;
        return !combat?.alive;
      }),
    [client, characterEntity],
  );
  return (
    <>
      <Inventory characterEntity={characterEntity} />
      <RespawnDialog open={isDead.value} />
    </>
  );
}

function Inventory({ characterEntity }: AreaUiProps) {
  const client = useRiftClient();
  const inventoryId = useMemo(
    () =>
      computed(() => {
        const id = characterEntity.value;
        if (id === undefined) return undefined;
        const ref = client.world.signal.get(id, InventoryRef).value;
        return ref?.inventoryId;
      }),
    [client, characterEntity],
  );
  const inventory = useMemo(
    () => inventorySignal(client.world, inventoryId),
    [client, inventoryId],
  );

  return (
    <div className={styles.inventory}>
      <div className={styles.itemGrid}>
        {inventory.value.map((item): ReactElement => {
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
