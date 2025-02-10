import type { StatePatchTransformer } from "@mp/sync/server";
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
export function deriveWorldStateForClient(
  clients: ClientRegistry,
): StatePatchTransformer<WorldState> {
  return (state, patches, clientId) => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = recordValues(state.actors).find(
      (actor) => actor.type === "character" && actor.userId === userId,
    );

    if (!clientCharacter) {
      return [];
    }

    return patches
      .filter((patch) => {
        const [prop, actorId] = patch.path;
        if (prop === "actors" && actorId) {
          if (actorId === clientCharacter.id) {
            return true;
          }
          const other = state.actors[actorId];
          return other && canSeeSubject(clientCharacter, state.actors[actorId]);
        }
        return true;
      })
      .map((patch) => {
        const [prop, ...rest] = patch.path;
        if (prop === "actors" && rest.length === 0) {
          return { ...patch, value: visibleActors(state, clientCharacter) };
        }
        return patch;
      });
  };
}

function visibleActors(
  state: WorldState,
  observer: Actor,
): Record<ActorId, Actor> {
  const visible: Record<ActorId, Actor> = {};
  for (const other of recordValues(state.actors).filter((other) =>
    canSeeSubject(observer, other),
  )) {
    visible[other.id] = other;
  }
  return visible;
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
