import type { ClientId } from "@mp/sync/server";
import { rect_fromDiameter, rect_intersectsPoint } from "@mp/math";
import { recordValues } from "@mp/std";
import { clientViewDistance } from "../../shared";
import type { ClientRegistry } from "../../ClientRegistry";
import type { MovementTrait } from "../../traits/movement";
import type { Actor, ActorId, WorldState } from "./WorldState";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveWorldStateForClient(clients: ClientRegistry) {
  return (state: WorldState, clientId: ClientId): WorldState => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = recordValues(state.actors).find(
      (actor) => actor.type === "character" && actor.userId === userId,
    );

    const visibleActors: Record<ActorId, Actor> = {};
    if (clientCharacter) {
      for (const id in state.actors) {
        const other = state.actors[id];
        if (canSeeSubject(clientCharacter, other)) {
          visibleActors[id] = other;
        }
      }
    }
    return {
      actors: visibleActors,
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
