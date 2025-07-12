import type { Signal } from "@mp/state";
import { Select } from "@mp/ui";

export interface AreaDebugSettingsFormProps {
  signal: Signal<AreaDebugSettings>;
}

export function AreaDebugSettingsForm({ signal }: AreaDebugSettingsFormProps) {
  return (
    <>
      <div>
        Visible Graph lines:{" "}
        <Select
          required
          options={visibleGraphTypes}
          value={signal.value.visibleGraphType}
          onChange={(visibleGraphType) => {
            signal.value = { ...signal.value, visibleGraphType };
          }}
        />
      </div>
      <label>
        <input
          type="checkbox"
          checked={signal.value.showFogOfWar}
          onChange={(e) => {
            signal.value = {
              ...signal.value,
              showFogOfWar: e.currentTarget.checked,
            };
          }}
        />
        Visualize network fog of war
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={signal.value.showAttackRange}
          onChange={(e) => {
            signal.value = {
              ...signal.value,
              showAttackRange: e.currentTarget.checked,
            };
          }}
        />
        Show actor attack range
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={signal.value.showAggroRange}
          onChange={(e) => {
            signal.value = {
              ...signal.value,
              showAggroRange: e.currentTarget.checked,
            };
          }}
        />
        Show npc aggro range
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={signal.value.showActorPaths}
          onChange={(e) => {
            signal.value = {
              ...signal.value,
              showActorPaths: e.currentTarget.checked,
            };
          }}
        />
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

export const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
export type VisibleGraphType = (typeof visibleGraphTypes)[number];
