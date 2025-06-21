import { Button } from "@mp/ui";
import {
  GameStateClientContext,
  type OptimisticGameStateSettings,
} from "@mp/game/client";
import type { Setter } from "solid-js";
import { createEffect, createSignal, useContext } from "solid-js";
import { assert } from "@mp/std";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";

export function MiscDebugUi(props: {
  settings: MiscDebugSettings;
  setSettings: Setter<MiscDebugSettings>;
}) {
  const rpc = useRpc();
  const gameState = useContext(GameStateClientContext);
  const [isServerPatchOptimizerEnabled, setServerPatchOptimizerEnabled] =
    createServerPatchOptimizerSignal();

  const serverVersion = rpc.system.buildVersion.useQuery();

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
              targetId: assert(gameState.characterId()),
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
          checked={props.settings.usePatchOptimizer}
          on:change={(e) =>
            props.setSettings((prev) => ({
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
          checked={props.settings.useInterpolator}
          on:change={(e) =>
            props.setSettings((prev) => ({
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

export interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
