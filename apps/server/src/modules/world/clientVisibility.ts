import type { ClientVisibilityFactory } from "@mp/sync/server";
import { rect_from_diameter, rect_hit_test } from "@mp/math";
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
export function deriveClientVisibility(
  clients: ClientRegistry,
): ClientVisibilityFactory<WorldState> {
  return (clientId, state) => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = recordValues(state.actors).find(
      (actor) => actor.type === "character" && actor.userId === userId,
    );
    return { actors: visibleActors(state, clientCharacter) };
  };
}

function visibleActors(
  state: WorldState,
  observer?: Actor,
): ReadonlySet<ActorId> {
  const visible = new Set<ActorId>();
  if (observer) {
    for (const other of recordValues(state.actors).filter((other) =>
      canSeeSubject(observer, other),
    )) {
      visible.add(other.id);
    }
  }
  return visible;
}

export function canSeeSubject(a: MovementTrait, b: MovementTrait) {
  if (a.areaId !== b.areaId) {
    return false;
  }
  const viewbox = rect_from_diameter(
    a.coords,
    clientViewDistance.networkFogOfWarTileCount,
  );
  return rect_hit_test(viewbox, b.coords);
}
