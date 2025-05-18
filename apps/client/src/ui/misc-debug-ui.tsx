import type { SelectOption } from "@mp/ui";
import { Button, Select } from "@mp/ui";
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
      <label>
        Server tick
        <Select
          options={serverTickOptions}
          value={serverTick()}
          onChange={setServerTick}
          isSameValue={(a, b) => a.compareTo(b) === 0}
        />
      </label>
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

const serverTickOptions: SelectOption<TimeSpan>[] = [
  0, 16, 50, 100, 300, 500, 1000, 2000, 5000,
].map((ms) => ({ value: TimeSpan.fromMilliseconds(ms), label: `${ms}ms` }));

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
      const matchesAnOption = serverTickOptions.some(
        (opt) => opt.value.compareTo(remoteServerTick.data) === 0,
      );
      if (matchesAnOption) {
        setServerTick(remoteServerTick.data);
      } else {
        setServerTick(serverTickOptions[0].value);
      }
    }
  });

  return [serverTick, setServerTick] as const;
}

export interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
