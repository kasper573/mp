import { PropertySignal, type Signal } from "@mp/state";
import { Checkbox, Select } from "@mp/ui";

export interface AreaDebugSettingsFormProps {
  signal: Signal<AreaDebugSettings>;
}

export function AreaDebugSettingsForm(props: AreaDebugSettingsFormProps) {
  return (
    <>
      <div>
        Visible Graph lines:{" "}
        <Select
          options={[...visibleGraphTypes]}
          signal={new PropertySignal(props.signal, "visibleGraphType")}
        />
      </div>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(props.signal, "showFogOfWar")} />
        Visualize network fog of war
      </label>
      <br />
      <label>
        <Checkbox
          signal={new PropertySignal(props.signal, "showAttackRange")}
        />
        Show actor attack range
      </label>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(props.signal, "showAggroRange")} />
        Show npc aggro range
      </label>
      <br />
      <label>
        <Checkbox signal={new PropertySignal(props.signal, "showActorPaths")} />
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
