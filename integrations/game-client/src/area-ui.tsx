import type { GameStateClient } from "./game-state-client";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi(props: { state: GameStateClient }) {
  const health = props.state.character.value?.combat.health ?? 0;

  return <RespawnDialog open={health <= 0} />;
}
