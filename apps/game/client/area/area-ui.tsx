import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi() {
  const client = ioc.get(ctxGameStateClient);

  return <RespawnDialog open={(client.character.get()?.health ?? 0) <= 0} />;
}
