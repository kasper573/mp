import type { ClientVisibilityFactory } from "@mp/sync";
import type { Tile } from "@mp/std";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";
import type { MovementTrait } from "../traits/movement";
import type { ActorId } from "../actor";
import type { GameState } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { ClientRegistry } from "./client-registry";

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
    const observerIds = [
      clients.characterIds.get(clientId),
      clients.spectatedCharacterIds.get(clientId),
    ];
    return {
      actors: new Set(visibleActors(state, observerIds)),
    };
  };

  function* visibleActors(
    state: GameState,
    observerIds: Iterable<ActorId | undefined>,
  ): Generator<ActorId> {
    for (const other of state.actors.values()) {
      for (const observerId of observerIds) {
        const observer = observerId ? state.actors.get(observerId) : undefined;
        if (observer && canSeeSubject(observer, other)) {
          yield other.id;
        }
      }
    }
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
