import { Button } from "@mp/ui";
import { GameStateClientContext } from "@mp/game/client";
import { createEffect, createSignal, useContext } from "solid-js";
import { assert } from "@mp/std";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";
import {
  miscDebugSettings,
  setMiscDebugSettings,
} from "../signals/misc-debug-ui-settings";

export function MiscDebugUi() {
  const rpc = useRpc();
  const [isServerPatchOptimizerEnabled, setServerPatchOptimizerEnabled] =
    createServerPatchOptimizerSignal();

  const serverVersion = rpc.system.buildVersion.useQuery();
  const gameState = useContext(GameStateClientContext);

  return (
    <>
      <div>Client version: {env.buildVersion}</div>
      <div>Server version: {serverVersion.data ?? "unknown"}</div>
      <div>
        <Button on:click={() => void rpc.npc.spawnRandomNpc()}>
          Spawn random NPC
        </Button>
        <Button
          on:click={() =>
            void rpc.character.kill({
              targetId: assert(gameState().characterId()),
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
          checked={isServerPatchOptimizerEnabled()}
          on:change={(e) =>
            setServerPatchOptimizerEnabled(e.currentTarget.checked)
          }
        />
      </div>
      <div>
        Use client side patch optimizer:{" "}
        <input
          type="checkbox"
          checked={miscDebugSettings().usePatchOptimizer}
          on:change={(e) =>
            setMiscDebugSettings((prev) => ({
              ...prev,
              usePatchOptimizer: e.currentTarget.checked,
            }))
          }
        />
      </div>
      <div>
        Use client side game state interpolator:{" "}
        <input
          type="checkbox"
          checked={miscDebugSettings().useInterpolator}
          on:change={(e) =>
            setMiscDebugSettings((prev) => ({
              ...prev,
              useInterpolator: e.currentTarget.checked,
            }))
          }
        />
      </div>
    </>
  );
}

function createServerPatchOptimizerSignal() {
  const rpc = useRpc();
  const [enabled, setEnabled] = createSignal(true);
  const isRemoteEnabled = rpc.system.isPatchOptimizerEnabled.useQuery();

  createEffect(() => {
    void rpc.system.setPatchOptimizerEnabled(enabled());
  });

  createEffect(() => {
    if (isRemoteEnabled.data !== undefined) {
      setEnabled(isRemoteEnabled.data);
    }
  });

  return [enabled, setEnabled] as const;
}
