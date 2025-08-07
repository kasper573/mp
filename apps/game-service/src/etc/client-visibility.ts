import type { CharacterId, ItemContainerId } from "@mp/db/types";
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
    const itemContainers = new Set<ItemContainerId>(
      actor?.type === "character" ? [actor.inventoryId] : undefined,
    );

    // You can see all items in the containers you can see
    let itemInstances = new Set<ItemInstanceId>();
    for (const containerId of itemContainers) {
      const container = state.itemContainers.get(containerId);
      if (container) {
        for (const itemId of container.itemInstanceIds) {
          itemInstances.add(itemId);
        }
      }
    }

    return {
      actors: visibleActors(state, characterId),
      globals,
      itemContainers,
      itemInstances,
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
