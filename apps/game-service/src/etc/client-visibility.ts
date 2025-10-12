import type { CharacterId } from "@mp/db/types";
import type {
  ActorId,
  AreaResource,
  GameState,
  ItemInstanceId,
  MovementTrait,
} from "@mp/game-shared";
import { clientViewDistanceRect } from "@mp/game-shared";
import type { Tile } from "@mp/std";
import type { ClientVisibilityFactory } from "@mp/sync";

/**
 * Determines what parts of the game state that should be visible to each client
 */
export function deriveClientVisibility(
  clientViewDistance: Tile,
  area: AreaResource,
): ClientVisibilityFactory<GameState, CharacterId> {
  const globals = new Set(["instance" as const]); // Always visible to everyone
  return (characterId, state) => {
    // You can see your own inventory
    const actor = state.actors.get(characterId);
    const characterInventoryId =
      actor?.type === "character" ? actor.inventoryId : undefined;
    const items = new Set<ItemInstanceId>(
      state.items
        .values()
        .filter((item) => item.inventoryId === characterInventoryId)
        .map((item) => item.id),
    );

    return {
      actors: visibleActors(state, characterId),
      globals,
      items,
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
    // You can see actors within view distance
    const box = clientViewDistanceRect(
      a.coords,
      area.tiled.tileCount,
      clientViewDistance,
    );
    return box.contains(b.coords);
  }
}
