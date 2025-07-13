import type { CheckboxState } from "@mp/ui";
import { Button, Checkbox } from "@mp/ui";
import { ctxGameStateClient, ioc } from "@mp/game";
import { assert } from "@mp/std";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { PropertySignal } from "@mp/state";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { useEffect } from "preact/hooks";

export function MiscDebugUi() {
  const rpc = useRpc();
  const isServerPatchOptimizerEnabled = useServerPatchOptimizerSignal();

  const serverVersion = rpc.system.buildVersion.useQuery();
  const gameState = ioc.get(ctxGameStateClient);

  return (
    <>
      <div>Client version: {env.buildVersion}</div>
      <div>Server version: {serverVersion.data ?? "unknown"}</div>
      <div>
        <Button onClick={() => void rpc.npc.spawnRandomNpc()}>
          Spawn random NPC
        </Button>
        <Button
          onClick={() =>
            void rpc.character.kill({
              targetId: assert(gameState.characterId.value),
            })
          }
        >
          Die
        </Button>
      </div>
      <div>
        Use server side patch optimizer:{" "}
        <Checkbox signal={isServerPatchOptimizerEnabled} />
      </div>
      <div>
        Use client side patch optimizer:{" "}
        <Checkbox
          signal={new PropertySignal(miscDebugSettings, "usePatchOptimizer")}
        />
      </div>
      <div>
        Use client side game state interpolator:{" "}
        <Checkbox
          signal={new PropertySignal(miscDebugSettings, "useInterpolator")}
        />
      </div>
    </>
  );
}

function useServerPatchOptimizerSignal() {
  const rpc = useRpc();
  const enabled = useSignal<CheckboxState>("indeterminate");
  const isRemoteEnabled = rpc.system.isPatchOptimizerEnabled.useQuery();

  useSignalEffect(() => {
    if (enabled.value !== "indeterminate") {
      void rpc.system.setPatchOptimizerEnabled(enabled.value);
    }
  });

  useEffect(() => {
    if (isRemoteEnabled.data !== undefined) {
      enabled.value = isRemoteEnabled.data;
    }
  }, [isRemoteEnabled.data, enabled]);

  return enabled;
}
