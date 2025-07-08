import { useObservable } from "@mp/state/solid";
import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import type { AreaDebugFormProps } from "./area-debug-settings-form";
import { AreaDebugForm } from "./area-debug-settings-form";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi(props: { debugFormProps: AreaDebugFormProps }) {
  const client = ioc.get(ctxGameStateClient);
  const character = useObservable(client.character);

  return (
    <>
      <GameDebugUiPortal>
        <AreaDebugForm {...props.debugFormProps} />
      </GameDebugUiPortal>
      <RespawnDialog open={(character()?.health ?? 0) <= 0} />
    </>
  );
}
