import { useContext } from "preact/hooks";
import * as styles from "./area-ui.css";
import { GameStateClientContext, useItemDefinition } from "./context";
import { RespawnDialog } from "./respawn-dialog";
import type { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import { Suspense, type ReactElement } from "preact/compat";

export function AreaUi() {
  const state = useContext(GameStateClientContext);
  const health = state.character.value?.combat.health ?? 0;

  return (
    <>
      <Inventory />
      <RespawnDialog open={health <= 0} />
    </>
  );
}

function Inventory() {
  const state = useContext(GameStateClientContext);

  return (
    <div className={styles.inventory}>
      <div className={styles.itemGrid}>
        {state.inventory.value.map((item): ReactElement => {
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

function ConsumableTile({ item }: { item: ConsumableInstance }) {
  const def = useItemDefinition(item);
  return (
    <div className={styles.itemTile({ type: "consumable" })}>
      {def.name} x {item.stackSize}/{def.maxStackSize}
    </div>
  );
}

function EquipmentTile({ item }: { item: EquipmentInstance }) {
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
