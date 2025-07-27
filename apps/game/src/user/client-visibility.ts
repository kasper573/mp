import type { ClientVisibilityFactory } from "@mp/sync";
import type { Tile } from "@mp/std";
import { clientViewDistanceRect } from "../clients/client-view-distance-rect";
import type { MovementTrait } from "../../src/traits/movement";
import type { ActorId } from "../actor/actor";
import type { GameState } from "../game-state/game-state";
import type { AreaResource } from "../area/area-resource";
import type { CharacterId } from "../character/types";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveClientVisibility(
  clientViewDistance: Tile,
  area: AreaResource,
): ClientVisibilityFactory<GameState, CharacterId> {
  return (characterId, state) => {
    return {
      actors: visibleActors(state, characterId),
      area: new Set(["current"]),
    };
  };

  function visibleActors(state: GameState, observerId: ActorId): Set<ActorId> {
    const ids = new Set<ActorId>();
    for (const other of state.actors.values()) {
      const observer = state.actors.get(observerId);
      if (observer && canSeeSubject(observer.movement, other.movement)) {
        ids.add(other.identity.id);
      }
    }
    return ids;
  }

  function canSeeSubject(a: MovementTrait, b: MovementTrait) {
    const box = clientViewDistanceRect(
      a.coords,
      area.tiled.tileCount,
      clientViewDistance,
    );
    return box.contains(b.coords);
  }
}
