import { Button } from "@mp/ui";
import {
  GameStateClientContext,
  type OptimisticGameStateSettings,
} from "@mp/game/client";
import type { Setter } from "solid-js";
import { createEffect, createSignal, useContext } from "solid-js";
import { assert } from "@mp/std";
import { TimeSpan } from "@mp/time";
import { useRpc } from "../integrations/rpc";

export function MiscDebugUi(props: {
  settings: MiscDebugSettings;
  setSettings: Setter<MiscDebugSettings>;
}) {
  const rpc = useRpc();
  const gameState = useContext(GameStateClientContext);
  const [serverTick, setServerTick] = createServerTickSignal();

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

export interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
