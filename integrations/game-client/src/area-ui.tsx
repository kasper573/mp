import { ctxGameStateClient, ioc } from "./context";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi() {
  const client = ioc.get(ctxGameStateClient);
  const health = client.character.value?.combat.health ?? 0;

  return <RespawnDialog open={health <= 0} />;
}
