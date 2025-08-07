import { useContext } from "preact/hooks";
import * as styles from "./area-ui.css";
import { GameStateClientContext } from "./context";
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

  return (
    <div className={styles.inventory}>
      <div>Inventory</div>
      {state.inventory.value.map((item) => (
        <div key={item.id}>
          instanceId: {item.id}, itemId: {item.itemId}
        </div>
      ))}
    </div>
  );
}
