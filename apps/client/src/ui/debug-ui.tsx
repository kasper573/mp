import { Button } from "@mp/ui";
import {
  GameStateClientContext,
  type OptimisticGameStateSettings,
} from "@mp/game/client";
import { useContext } from "solid-js";
import { assert } from "@mp/std";
import { createStorageSignal } from "@mp/state";
import { useRpc } from "../integrations/rpc";

export function DebugUi() {
  const rpc = useRpc();
  const gameState = useContext(GameStateClientContext);
  const [settings, setSettings] = createStorageSignal<DebugSettings>(
    localStorage,
    "debug-settings",
    defaultSettings,
  );

  return (
    <>
      <div>
        Server tick: 1ms <input type="range" min={1} max={1000} /> 1000ms
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
        <label>
          <input
            type="checkbox"
            checked={settings().visualizeNetworkFogOfWar}
            on:change={(e) =>
              setSettings((prev) => ({
                ...prev,
                visualizeNetworkFogOfWar: e.currentTarget.checked,
              }))
            }
          />
          Visualize network fog of war
        </label>
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

const defaultSettings: DebugSettings = {
  useInterpolator: true,
  usePatchOptimizer: true,
  visualizeNetworkFogOfWar: false,
};

interface DebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
