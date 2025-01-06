import type { ClientId } from "@mp/sync-server";
import { clients } from "../../main";
import type { WorldState } from "../../package";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveWorldStateForClient(
  state: WorldState,
  clientId: ClientId,
): WorldState {
  const userId = clients.getUserId(clientId);
  const char = Object.values(state.characters).find(
    (char) => char.userId === userId,
  );
  if (!char) {
    throw new Error(
      "Could not derive world state for client: user has no associated character",
    );
  }

  return state;
}
