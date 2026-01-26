import { useContext, Suspense, For, type JSXElement } from "solid-js";
import * as styles from "./area-ui.css";
import { GameStateClientContext, useItemDefinition } from "./context";
import { RespawnDialog } from "./respawn-dialog";
import type { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";

export function AreaUi() {
  const state = useContext(GameStateClientContext);
  const health = () => state.character.get()?.combat.health ?? 0;

  return (
    <>
      <Inventory />
      <RespawnDialog open={health() <= 0} />
    </>
  );
}

function Inventory() {
  const state = useContext(GameStateClientContext);

  return (
    <div class={styles.inventory}>
      <div class={styles.itemGrid}>
        <For each={state.inventory.get()}>
          {(item): JSXElement => {
            switch (item.type) {
              case "equipment":
                return (
                  <Suspense fallback={<LoadingTile />}>
                    <EquipmentTile item={item} />
                  </Suspense>
                );
              case "consumable":
                return (
                  <Suspense fallback={<LoadingTile />}>
                    <ConsumableTile item={item} />
                  </Suspense>
                );
            }
          }}
        </For>
      </div>
      <div class={styles.label}>Inventory</div>
    </div>
  );
}

function ConsumableTile({ item }: { item: ConsumableInstance }) {
  const def = useItemDefinition(item);
  return (
    <div class={styles.itemTile({ type: "consumable" })}>
      {def.name} x {item.stackSize}/{def.maxStackSize}
    </div>
  );
}

function EquipmentTile({ item }: { item: EquipmentInstance }) {
  const def = useItemDefinition(item);
  return (
    <div class={styles.itemTile({ type: "equipment" })}>
      {def.name} ({item.durability}/{def.maxDurability})
    </div>
  );
}

function LoadingTile() {
  return <div class={styles.itemTile({ type: "loading" })} />;
}
