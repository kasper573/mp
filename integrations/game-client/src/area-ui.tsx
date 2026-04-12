import { useContext } from "preact/hooks";
import { GameStateClientContext } from "./context";
import { RespawnDialog } from "./respawn-dialog";
import { Combat } from "@mp/world";

export function AreaUi() {
  const state = useContext(GameStateClientContext);
  const entity = state.myEntity.value;
  const health = entity ? entity.get(Combat).health : 0;

  return <RespawnDialog open={health <= 0} />;
}
