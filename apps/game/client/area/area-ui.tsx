import { useObservable } from "@mp/state/solid";
import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import type { AreaDebugSettingsFormProps } from "./area-debug-settings-form";
import { AreaDebugSettingsForm } from "./area-debug-settings-form";
import { RespawnDialog } from "./respawn-dialog";

export function AreaUi(props: { debugFormProps: AreaDebugSettingsFormProps }) {
  const client = ioc.get(ctxGameStateClient);
  const character = useObservable(client.character);

  return (
    <>
      <GameDebugUiPortal>
        <AreaDebugSettingsForm {...props.debugFormProps} />
      </GameDebugUiPortal>
      <RespawnDialog open={(character()?.health ?? 0) <= 0} />
    </>
  );
}
