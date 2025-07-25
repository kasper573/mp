import { PropertySignal, type Signal } from "@mp/state";
import { Checkbox, Select } from "@mp/ui";

export interface AreaDebugSettingsFormProps {
  signal: Signal<AreaDebugSettings>;
}

export function AreaDebugSettingsForm({ signal }: AreaDebugSettingsFormProps) {
  return (
    <>
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
