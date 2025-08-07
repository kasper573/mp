import type { CharacterId } from "@mp/db/types";
import type {
  ActorId,
  AreaResource,
  GameState,
  MovementTrait,
} from "@mp/game-shared";
import { clientViewDistanceRect } from "@mp/game-shared";
import type { Tile } from "@mp/std";
import type { ClientVisibilityFactory } from "@mp/sync";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveClientVisibility(
  clientViewDistance: Tile,
  area: AreaResource,
): ClientVisibilityFactory<GameState, CharacterId> {
  const globals = new Set(["instance" as const]); // Always visible to everyone
  return (characterId, state) => {
    return {
      actors: visibleActors(state, characterId),
      globals,
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
