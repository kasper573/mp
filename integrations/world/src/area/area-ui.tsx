import { useMemo } from "preact/hooks";
import * as styles from "./area-ui.css";
import { useItemDefinition, useRiftClient } from "../client/context";
import { RespawnDialog } from "../character/respawn-dialog";
import type {
  Character,
  ConsumableInstanceView,
  EquipmentInstanceView,
} from "../client/views";
import type { ReadonlySignal } from "@preact/signals-core";
import { inventorySignal } from "../client/signals";
import { Suspense, type ReactElement } from "preact/compat";

export interface AreaUiProps {
  character: ReadonlySignal<Character | undefined>;
}

export function AreaUi({ character }: AreaUiProps) {
  const health = character.value?.combat.health ?? 0;
  return (
    <>
      <Inventory character={character} />
      <RespawnDialog open={health <= 0} />
    </>
  );
}

function Inventory({ character }: AreaUiProps) {
  const client = useRiftClient();
  const inventory = useMemo(
    () => inventorySignal(client.world, character),
    [client, character],
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
