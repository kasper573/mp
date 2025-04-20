import type { UpdatePatchFilterRecord } from "@mp/sync";
import type { GameState } from "./game-state";

export const gameStatePatchOptimizer: UpdatePatchFilterRecord<GameState> = {
  actors: (update) => {
    switch (update.key) {
      case "coords":
        // Only send coord patches when integer value of coords have changed
        return !update.newValue.round().equals(update.oldValue.round());
      case "moveTarget":
        // HACK emulate a view model like behavior. Clients never use moveTarget for anything, so we don't need to sent this.
        // it's hacky, because typescript will still allow you to use moveTarget in the client,
        // but this optimizer now makes moveTarget always stale on the client.
        // If we do this for more properties we should consider creating a client/server model separation instead.
        return false;
    }
    return update.newValue !== update.oldValue;
  },
};
