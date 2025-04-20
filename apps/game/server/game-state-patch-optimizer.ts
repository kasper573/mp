import type { UpdatePatchFilterRecord } from "@mp/sync";
import type { GameState } from "./game-state";

export const gameStatePatchOptimizer: UpdatePatchFilterRecord<GameState> = {
  actors: (update) => {
    switch (update.key) {
      case "coords": {
        // Only send coord patches when integer value of coords have changed
        return !update.newValue.round().equals(update.oldValue.round());
      }
    }
    return update.newValue !== update.oldValue;
  },
};
