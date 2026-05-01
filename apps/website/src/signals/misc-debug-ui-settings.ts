import { StorageSignal } from "@mp/state";

export interface MiscDebugSettings {
  useInterpolator: boolean;
  visualizeNetworkFogOfWar: boolean;
}

export const miscDebugSettings = new StorageSignal<MiscDebugSettings>(
  "local",
  "misc-debug-settings",
  {
    useInterpolator: true,
    visualizeNetworkFogOfWar: false,
  },
);
