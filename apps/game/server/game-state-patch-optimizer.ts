import type { EntityPatchOptimizerRecord } from "@mp/sync";
import { isPathEqual } from "@mp/math";
import type { GameState } from "./game-state";

export const gameStatePatchOptimizers: EntityPatchOptimizerRecord<GameState> = {
  actors: {
    coords: {
      filter: (newValue, oldValue) =>
        // Only send coord patches when integer value of coords have changed
        !newValue.round().equals(oldValue.round()),
    },
    path: {
      // The client never need to see the whole path, just enough to do lerping
      transform: (value) => value?.slice(0, 2),
      filter: isPathEqual,
    },
    moveTarget: {
      // Clients never use moveTarget for anything, so we don't need to sent this.
      // HACK typescript will still allow you to use moveTarget in the client, and those values will always be stale.
      // If we do this for more properties we should consider creating a client/server model separation instead.
      filter: () => false,
    },
  },
};
