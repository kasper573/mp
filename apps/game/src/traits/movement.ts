import type { AreaId, CharacterId } from "@mp/db/types";
import type { InjectionContainer } from "@mp/ioc";
import type { CardinalDirection, Path, Vector, VectorLike } from "@mp/math";
import { assert, type Tile } from "@mp/std";
import { defineSyncComponent } from "@mp/sync";
import type { ObjectId } from "@mp/tiled-loader";
import type { TickEventHandler } from "@mp/time";
import type { AreaResource } from "../area/area-resource";
import { getAreaIdFromObject } from "../area/area-resource";
import { moveAlongPath } from "../area/move-along-path";
import type { Character } from "../character/types";
import { ctxArea } from "../context/common";
import { ctxGameState } from "../game-state/game-state";
import { ctxGameStateLoader } from "../game-state/game-state-loader";
import { ctxGameEventClient } from "../network/game-event-client";
import * as patchOptimizers from "../network/patch-optimizers";

export type MovementTrait = typeof MovementTrait.$infer;

export const MovementTrait = defineSyncComponent((builder) =>
  builder
    /**
     * Current position of the subject.
     */
    .add<Vector<Tile>>(patchOptimizers.coords)("coords")
    .add<Tile>()("speed")
    /**
     * A desired target. Will be consumed by the movement behavior to find a new path.
     */
    .add<Vector<Tile> | undefined>()("moveTarget")
    /**
     * Has to be explicitly set by the client for portal traversal to be able to happen.
     * This avoids unintended portal traversal by actors that are not supposed to use portals.
     * The movement behavior will continuously check if the actor has reached this portal.
     */
    .add<ObjectId | undefined>()("desiredPortalId")
    /**
     * The current path the subject is following.
     */
    .add<Path<Tile> | undefined>(patchOptimizers.path)("path")
    /**
     * The direction the subject is facing.
     */
    .add<CardinalDirection>()("dir"),
);

export function movementBehavior(ioc: InjectionContainer): TickEventHandler {
  return function movementBehaviorTick({ timeSinceLastTick }) {
    const area = ioc.get(ctxArea);
    const state = ioc.get(ctxGameState);
    for (const actor of state.actors.values()) {
      // The dead don't move
      if (actor.combat.health <= 0) {
        actor.movement.path = undefined;
        actor.movement.moveTarget = undefined;
        continue;
      }

      // Consume the move target and produce a new path to move along
      if (actor.movement.moveTarget) {
        actor.movement.path = findPathForSubject(
          actor.movement,
          area,
          actor.movement.moveTarget,
        );
        actor.movement.moveTarget = undefined;
      }

      moveAlongPath(actor.movement, timeSinceLastTick);

      // Process portals
      for (const object of area.hitTestObjects(
        area.tiled.tileCoordToWorld(actor.movement.coords),
      )) {
        const destinationAreaId = getAreaIdFromObject(object) as
          | AreaId
          | undefined;
        if (
          destinationAreaId &&
          actor.type === "character" &&
          actor.movement.desiredPortalId === object.id
        ) {
          sendCharacterToArea(ioc, actor.identity.id, destinationAreaId);
        }
      }
    }
  };
}

export function sendCharacterToArea(
  ioc: InjectionContainer,
  characterId: CharacterId,
  destinationAreaId: AreaId,
  coords?: Vector<Tile>,
) {
  const gameState = ioc.get(ctxGameState);
  const currentArea = ioc.get(ctxArea);
  const char = assert(
    gameState.actors.get(characterId),
    `Character ${characterId} not found in game state`,
  ) as Character;

  // Actors area ids are only stored in the database.
  // What controls which area an actor is associated with at runtime is simply if it's been added to a game server instance.
  // Each game service instance only houses one specific area,
  // so adding an actor to a game servers game state is equal to adding it to that area.

  char.movement.path = undefined;
  char.movement.desiredPortalId = undefined;

  // If we're portalling within the same area we can just change coords
  if (destinationAreaId === currentArea.id) {
    char.movement.coords = coords ?? currentArea.start;
    return;
  }

  // Since moving to another area means to remove the character from the current game service,
  // any mutations that's been done to this character this server tick would be lost unless we save them explicitly right now,
  // since regular persistence is done on interval, an interval which we would miss here.
  const loader = ioc.get(ctxGameStateLoader);
  void loader.saveCharacterToDb(char);

  // But if we're moving to a different area we must communicate
  // with other services and tell them to pick up this character.

  // RISK: Removing the character and blindly trusting other services to
  // reinstate them in their instance may lead to characters being left in the void.
  // It's a minor risk. At worst, the player will have disconnect and
  // reconnect to have a game service pick them up again.
  gameState.actors.delete(characterId);

  // Inform other services that the character wants to join another area
  const client = ioc.get(ctxGameEventClient);
  client.network.characterWantsToJoinArea({
    characterId,
    areaId: destinationAreaId,
  });
}

export function findPathForSubject(
  subject: MovementTrait,
  area: AreaResource,
  dest: VectorLike<Tile>,
): Path<Tile> | undefined {
  const fromNode = area.graph.getProximityNode(subject.coords);
  if (!fromNode) {
    return;
  }
  const destNode = area.graph.getProximityNode(dest);
  if (!destNode) {
    return;
  }
  return area.graph.findPath(fromNode, destNode);
}
