import { PropertySignal, type Signal } from "@mp/state";
import { assert } from "@mp/std";
import { Button, Checkbox, Select } from "@mp/ui";
import { ioc } from "../context/ioc";
import { ctxGameEventClient } from "../network/game-event-client";
import { ctxGameStateClient } from "../game-state/game-state-client";

export interface AreaDebugSettingsFormProps {
  signal: Signal<AreaDebugSettings>;
}

export function AreaDebugSettingsForm({ signal }: AreaDebugSettingsFormProps) {
  const events = ioc.get(ctxGameEventClient);
  const client = ioc.get(ctxGameStateClient);
  return (
    <>
      <div>
        <Button onClick={() => void events.npc.spawnRandomNpc()}>
          Spawn random NPC
        </Button>
        <Button
          onClick={() =>
            void events.character.kill({
              targetId: assert(client.characterId.value),
            })
          }
        >
          Die
        </Button>
      </div>
      <div>
        Visible Graph lines:{" "}
        <Select
          options={visibleGraphTypes}
          signal={new PropertySignal(signal, "visibleGraphType")}
        />
      </div>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(signal, "showFogOfWar")} />
        Visualize network fog of war
      </label>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(signal, "showAttackRange")} />
        Show actor attack range
      </label>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(signal, "showAggroRange")} />
        Show npc aggro range
      </label>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(signal, "showActorPaths")} />
        Show actor paths
      </label>
    </>
  );
}

export interface AreaDebugSettings {
  visibleGraphType: VisibleGraphType;
  showFogOfWar: boolean;
  showAttackRange: boolean;
  showAggroRange: boolean;
  showActorPaths: boolean;
}

export const visibleGraphTypes = [
  "none",
  "all",
  "tile",
  "proximityNode",
  "obscured",
] as const;
export type VisibleGraphType = (typeof visibleGraphTypes)[number];
