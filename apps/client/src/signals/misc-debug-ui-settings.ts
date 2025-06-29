import { createReactiveStorage } from "@mp/state";
import type { OptimisticGameStateSettings } from "@mp/game/client";

export const miscDebugStorage = createReactiveStorage<MiscDebugSettings>(
  localStorage,
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
