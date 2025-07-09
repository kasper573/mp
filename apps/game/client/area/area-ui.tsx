import { useObservable } from "@mp/state/solid";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi() {
  const client = ioc.get(ctxGameStateClient);
  const character = useObservable(client.character);

  return (
    <>
      <RespawnDialog open={(character()?.health ?? 0) <= 0} />
    </>
  );
}
