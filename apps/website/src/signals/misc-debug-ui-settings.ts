import { StorageSignal } from "@mp/state";

export interface MiscDebugSettings {
  visualizeNetworkFogOfWar: boolean;
}

export const miscDebugSettings = new StorageSignal<MiscDebugSettings>(
  "local",
  "misc-debug-settings",
  {
    visualizeNetworkFogOfWar: false,
  },
);
