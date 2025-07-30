import type { OptimisticGameStateSettings } from "@mp/game-client";
import { StorageSignal } from "@mp/state";

export const miscDebugSettings = new StorageSignal<MiscDebugSettings>(
  "local",
  "misc-debug-settings",
  {
    useInterpolator: true,
    usePatchOptimizer: true,
    visualizeNetworkFogOfWar: false,
  },
);

export interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
