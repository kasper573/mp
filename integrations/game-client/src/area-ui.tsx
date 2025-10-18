import { useContext } from "preact/hooks";
import * as styles from "./area-ui.css";
import { GameAssetLoaderContext, GameStateClientContext } from "./context";
import { RespawnDialog } from "./respawn-dialog";
import type { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import type { ReactElement } from "preact/compat";

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
      <div>Inventory</div>
      {state.inventory.value.map((item): ReactElement => {
        switch (item.type) {
          case "equipment":
            return <EquipmentRow key={item.id} item={item} />;
          case "consumable":
            return <ConsumableRow key={item.id} item={item} />;
        }
      })}
    </div>
  );
}

function ConsumableRow({ item }: { item: ConsumableInstance }) {
  const { useItemDefinition } = useContext(GameAssetLoaderContext);
  const def = useItemDefinition(item);
  return (
    <div>
      {def.name} x {item.stackSize}/{def.maxStackSize}
    </div>
  );
}

function EquipmentRow({ item }: { item: EquipmentInstance }) {
  const { useItemDefinition } = useContext(GameAssetLoaderContext);
  const def = useItemDefinition(item);
  return (
    <div>
      {def.name} ({item.durability}/{def.maxDurability})
    </div>
  );
}
