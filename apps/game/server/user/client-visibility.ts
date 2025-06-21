import type { ClientVisibilityFactory } from "@mp/sync";
import { recordValues, type Tile } from "@mp/std";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";
import type { MovementTrait } from "../traits/movement";
import type { Actor, ActorId } from "../actor";
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
    const characterId = clients.characterIds.get(clientId);

    return {
      actors: visibleActors(
        state,
        characterId ? state.actors[characterId] : undefined,
      ),
    };
  };

  function visibleActors(
    state: GameState,
    observer?: Actor,
  ): ReadonlySet<ActorId> {
    const visible = new Set<ActorId>();
    if (observer) {
      for (const other of recordValues(state.actors)) {
        if (canSeeSubject(observer, other)) {
          visible.add(other.id);
        }
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
