import { Button } from "@mp/ui";
import {
  GameStateClientContext,
  type OptimisticGameStateSettings,
} from "@mp/game/client";
import { createEffect, createSignal, useContext } from "solid-js";
import { assert } from "@mp/std";
import { createStorageSignal } from "@mp/state";
import { TimeSpan } from "@mp/time";
import { useRpc } from "../integrations/rpc";

export function MiscDebugUi() {
  const rpc = useRpc();
  const gameState = useContext(GameStateClientContext);
  const [serverTick, setServerTick] = createServerTickSignal();
  const [settings, setSettings] = createStorageSignal<MiscDebugSettings>(
    localStorage,
    "misc-debug-settings",
    defaultSettings,
  );

  return (
    <>
      <div>
        Server tick: 1ms{" "}
        <input
          type="range"
          min={1}
          max={1000}
          value={serverTick().totalMilliseconds}
          on:change={(e) =>
            setServerTick(
              TimeSpan.fromMilliseconds(
                Number.parseInt(e.currentTarget.value, 10),
              ),
            )
          }
        />{" "}
        1000ms
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
    </>
  );
}

function createServerTickSignal() {
  const rpc = useRpc();
  const [serverTick, setServerTick] = createSignal(
    TimeSpan.fromMilliseconds(50),
  );
  const remoteServerTick = rpc.system.serverTickInterval.useQuery();

  createEffect(() => {
    void rpc.system.setServerTickInterval(serverTick());
  });

  createEffect(() => {
    if (remoteServerTick.data) {
      setServerTick(remoteServerTick.data);
    }
  });

  return [serverTick, setServerTick] as const;
}

const defaultSettings: MiscDebugSettings = {
  useInterpolator: true,
  usePatchOptimizer: true,
  visualizeNetworkFogOfWar: false,
};

interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
