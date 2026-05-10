import * as styles from "./area-ui.css";
import { useRift } from "../client";
import { useItemDefinition } from "../renderer/context";
import { RespawnDialog } from "../character/respawn-dialog";
import type {
  ConsumableInstanceView,
  EquipmentInstanceView,
} from "../inventory/views";
import { claimedInventoryItems } from "../inventory/signals";
import { Suspense, type ReactElement } from "preact/compat";

export function AreaUi() {
  return (
    <>
      <Inventory />
      <RespawnDialog />
    </>
  );
}

function Inventory() {
  const items = useRift((c) => claimedInventoryItems(c.world.signal));

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
