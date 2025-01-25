import type { ClientId } from "@mp/sync/server";
import { rect_fromDiameter, rect_intersectsPoint } from "@mp/math";
import { clientViewDistance } from "../../shared";
import type { ClientRegistry } from "../../ClientRegistry";
import type { MovementTrait } from "../../traits/movement";
import type { WorldState } from "./WorldState";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveWorldStateForClient(clients: ClientRegistry) {
  return (state: WorldState, clientId: ClientId): WorldState => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = Object.values(state.characters).find(
      (char) => char.userId === userId,
    );

    if (!clientCharacter) {
      return { characters: {}, npcs: {} };
    }

    const visibleCharacters = Object.entries(state.characters).filter(
      ([_, other]) => canSeeSubject(clientCharacter, other),
    );

    const visibleNpcs = Object.entries(state.npcs).filter(([_, other]) =>
      canSeeSubject(clientCharacter, other),
    );

    return {
      characters: Object.fromEntries(visibleCharacters),
      npcs: Object.fromEntries(visibleNpcs),
    };
  };
}

function canSeeSubject(a: MovementTrait, b: MovementTrait) {
  if (a.areaId !== b.areaId) {
    return false;
  }
  const viewbox = rect_fromDiameter(
    a.coords,
    clientViewDistance.networkFogOfWarTileCount,
  );
  return rect_intersectsPoint(viewbox, b.coords);
}
