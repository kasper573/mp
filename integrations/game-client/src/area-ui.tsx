import { useContext, Suspense, For, Switch, Match, type JSX } from "solid-js";
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
          {(item): JSX.Element => (
            <Switch>
              <Match when={item.type === "equipment" && item}>
                {(equipItem) => (
                  <Suspense fallback={<LoadingTile />}>
                    <EquipmentTile item={equipItem() as EquipmentInstance} />
                  </Suspense>
                )}
              </Match>
              <Match when={item.type === "consumable" && item}>
                {(consumeItem) => (
                  <Suspense fallback={<LoadingTile />}>
                    <ConsumableTile
                      item={consumeItem() as ConsumableInstance}
                    />
                  </Suspense>
                )}
              </Match>
            </Switch>
          )}
        </For>
      </div>
      <div class={styles.label}>Inventory</div>
    </div>
  );
}

function ConsumableTile(props: { item: ConsumableInstance }) {
  const def = useItemDefinition(props.item);
  return (
    <div class={styles.itemTile({ type: "consumable" })}>
      {def.name} x {props.item.stackSize}/{def.maxStackSize}
    </div>
  );
}

function EquipmentTile(props: { item: EquipmentInstance }) {
  const def = useItemDefinition(props.item);
  return (
    <div class={styles.itemTile({ type: "equipment" })}>
      {def.name} ({props.item.durability}/{def.maxDurability})
    </div>
  );
}

function LoadingTile() {
  return <div class={styles.itemTile({ type: "loading" })} />;
}
