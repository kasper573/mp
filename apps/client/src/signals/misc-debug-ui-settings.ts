import { createStorageSignal } from "@mp/state";
import type { OptimisticGameStateSettings } from "@mp/game/client";

export const [miscDebugSettings, setMiscDebugSettings] =
  createStorageSignal<MiscDebugSettings>(localStorage, "misc-debug-settings", {
    useInterpolator: true,
    usePatchOptimizer: true,
    visualizeNetworkFogOfWar: false,
  });

export interface MiscDebugSettings extends OptimisticGameStateSettings {
  visualizeNetworkFogOfWar: boolean;
}
