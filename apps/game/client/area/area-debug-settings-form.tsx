import { StorageAdapter } from "@mp/state";
import { Select } from "@mp/ui";
import type { Setter } from "solid-js";

export interface AreaDebugSettingsFormProps {
  value: AreaDebugSettings;
  onChange: Setter<AreaDebugSettings>;
}

export function AreaDebugSettingsForm(props: AreaDebugSettingsFormProps) {
  return (
    <>
      <div>
        Visible Graph lines:{" "}
        <Select
          required
          options={visibleGraphTypes}
          value={props.value.visibleGraphType}
          onChange={(visibleGraphType) =>
            props.onChange((prev) => ({ ...prev, visibleGraphType }))
          }
        />
      </div>
      <label>
        <input
          type="checkbox"
          checked={props.value.showFogOfWar}
          on:change={(e) =>
            props.onChange((prev) => ({
              ...prev,
              showFogOfWar: e.currentTarget.checked,
            }))
          }
        />
        Visualize network fog of war
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={props.value.showAttackRange}
          on:change={(e) =>
            props.onChange((prev) => ({
              ...prev,
              showAttackRange: e.currentTarget.checked,
            }))
          }
        />
        Show actor attack range
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={props.value.showAggroRange}
          on:change={(e) =>
            props.onChange((prev) => ({
              ...prev,
              showAggroRange: e.currentTarget.checked,
            }))
          }
        />
        Show npc aggro range
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={props.value.showActorPaths}
          on:change={(e) =>
            props.onChange((prev) => ({
              ...prev,
              showActorPaths: e.currentTarget.checked,
            }))
          }
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

export const areaDebugSettingsStorage = new StorageAdapter<AreaDebugSettings>(
  "local",
  "area-debug-settings",
  {
    visibleGraphType: "none",
    showActorPaths: false,
    showFogOfWar: false,
    showAttackRange: false,
    showAggroRange: false,
  },
);

export const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
export type VisibleGraphType = (typeof visibleGraphTypes)[number];
