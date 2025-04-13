import type { ClientVisibilityFactory } from "@mp/sync/server";
import type { Tile } from "@mp/std";
import { recordValues } from "@mp/std";
import { clientViewDistanceRect } from "../shared/client-view-distance-rect";
import type { ClientRegistry } from "./client-registry";
import type { MovementTrait } from "./traits/movement";
import type { Actor, ActorId } from "./traits/actor";
import type { GameState } from "./game-state";
import type { AreaLookup } from "./area/load-areas";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveClientVisibility(
  clients: ClientRegistry,
  clientViewDistance: Tile,
  areas: AreaLookup,
): ClientVisibilityFactory<GameState> {
  return (clientId, state) => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = recordValues(state.actors).find(
      (actor) => actor.type === "character" && actor.userId === userId,
    );
    return { actors: visibleActors(state, clientCharacter) };
  };

  function visibleActors(
    state: GameState,
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

  function canSeeSubject(a: MovementTrait, b: MovementTrait) {
    if (a.areaId !== b.areaId) {
      return false;
    }
    const area = areas.get(a.areaId);
    if (!area) {
      throw new Error(`Area ${a.areaId} not found`);
    }
    const box = clientViewDistanceRect(
      a.coords,
      area.tiled.tileCount,
      clientViewDistance,
    );
    return box.contains(b.coords);
  }
}
