import type { EntityPatchOptimizerRecord } from "@mp/sync";
import { isPathEqual } from "@mp/math";
import type { GameState } from "./game-state";

export const gameStatePatchOptimizers: EntityPatchOptimizerRecord<GameState> = {
  actors: {
    coords: {
      filter: (newValue, oldValue) =>
        // Since the client lerps coords along its current path we don't need to
        // send actual coordinate updates at a high frequency, so only sending
        // the new value when it's a new integer value is a good enough frequency.
        // It's a bit unsafe since we rely on coords always converging on a whole number,
        // but the movement system should always ensure that, so it's fine.
        !newValue.round().equals(oldValue.round()),
    },
    path: {
      // The client never need to see the whole path, just enough to do lerping
      transform: (value) => value?.slice(0, 2),
      filter: isPathEqual,
    },

    // Clients never use these properties for anything, so we don't need to send them.
    // HACK typescript will still allow you to use these in the client, and those values will always be stale.
    // TODO we should consider creating a client/server model separation instead and make it impossible for the client to rely on these.
    moveTarget: { filter: noop },
    lastAttack: { filter: noop },
  },
};

function noop() {
  return false;
}
