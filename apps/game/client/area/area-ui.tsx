import { useObservable } from "@mp/state/solid";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi() {
  const client = ioc.get(ctxGameStateClient);
  const health = useObservable(client.character.derive((c) => c?.health ?? 0));

  return <RespawnDialog open={health() <= 0} />;
}
