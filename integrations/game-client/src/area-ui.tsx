import { useContext } from "preact/hooks";
import * as styles from "./area-ui.css";
import { GameAssetLoaderContext, GameStateClientContext } from "./context";
import { RespawnDialog } from "./respawn-dialog";

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
  const { useItems } = useContext(GameAssetLoaderContext);
  const items = useItems(state.inventory.value.map((item) => item.itemId));

  return (
    <div className={styles.inventory}>
      <div>Inventory</div>
      {state.inventory.value.map((item) => (
        <div key={item.id}>{items.get(item.itemId)?.name}</div>
      ))}
    </div>
  );
}
