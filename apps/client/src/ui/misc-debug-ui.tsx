import { Button } from "@mp/ui";
import { ctxGameStateClient, ioc } from "@mp/game/client";
import { createEffect, createSignal } from "solid-js";
import { assert } from "@mp/std";
import { useStorage } from "@mp/state/solid";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";
import { miscDebugStorage } from "../signals/misc-debug-ui-settings";

export function MiscDebugUi() {
  const [settings, setSettings] = useStorage(miscDebugStorage);
  const rpc = useRpc();
  const [isServerPatchOptimizerEnabled, setServerPatchOptimizerEnabled] =
    createServerPatchOptimizerSignal();

  const serverVersion = rpc.system.buildVersion.useQuery();
  const gameState = ioc.get(ctxGameStateClient);

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
              targetId: assert(gameState.characterId.$getObservableValue()),
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
          checked={settings().usePatchOptimizer}
          on:change={(e) =>
            setSettings((prev) => ({
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
          checked={settings().useInterpolator}
          on:change={(e) =>
            setSettings((prev) => ({
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
