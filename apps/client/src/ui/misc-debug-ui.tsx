import { Button } from "@mp/ui";
import { ctxGameStateClient, ioc } from "@mp/game/client";
import { useEffect, useState } from "preact/hooks";
import { assert } from "@mp/std";
import { useSignalEffect } from "@mp/state/react";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";
import { miscDebugSettingsSignal } from "../signals/misc-debug-ui-settings";

export function MiscDebugUi() {
  const rpc = useRpc();
  const [isServerPatchOptimizerEnabled, setServerPatchOptimizerEnabled] =
    useServerPatchOptimizerState();

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
        <input
          type="checkbox"
          checked={isServerPatchOptimizerEnabled}
          onChange={(e) =>
            setServerPatchOptimizerEnabled(e.currentTarget.checked)
          }
        />
      </div>
      <div>
        Use client side patch optimizer:{" "}
        <input
          type="checkbox"
          checked={miscDebugSettingsSignal.value.usePatchOptimizer}
          onChange={(e) =>
            (miscDebugSettingsSignal.value = {
              ...miscDebugSettingsSignal.value,
              usePatchOptimizer: e.currentTarget.checked,
            })
          }
        />
      </div>
      <div>
        Use client side game state interpolator:{" "}
        <input
          type="checkbox"
          checked={miscDebugSettingsSignal.value.useInterpolator}
          onChange={(e) => {
            miscDebugSettingsSignal.value = {
              ...miscDebugSettingsSignal.value,
              useInterpolator: e.currentTarget.checked,
            };
          }}
        />
      </div>
    </>
  );
}

function useServerPatchOptimizerState() {
  const rpc = useRpc();
  const [enabled, setEnabled] = useState(true);
  const isRemoteEnabled = rpc.system.isPatchOptimizerEnabled.useQuery();

  useEffect(() => {
    void rpc.system.setPatchOptimizerEnabled(enabled);
  }, [enabled]);

  useSignalEffect(() => {
    if (isRemoteEnabled.data !== undefined) {
      setEnabled(isRemoteEnabled.data);
    }
  });

  return [enabled, setEnabled] as const;
}
