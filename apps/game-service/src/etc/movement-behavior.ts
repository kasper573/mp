import type { AreaId, CharacterId } from "@mp/game-shared";
import type { AreaResource, Character, MovementTrait } from "@mp/game-shared";
import { getDestinationFromObject, moveAlongPath } from "@mp/game-shared";
import type { InjectionContainer } from "@mp/ioc";
import type { Path, Vector, VectorLike } from "@mp/math";
import { assert, type Tile } from "@mp/std";
import type { TickEventHandler } from "@mp/time";
import {
  ctxArea,
  ctxDb,
  ctxDbSyncSession,
  ctxGameEventClient,
  ctxGameState,
  ctxLogger,
} from "../context";

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
        const destination = getDestinationFromObject(object);
        if (
          destination?.isOk() &&
          actor.type === "character" &&
          actor.movement.desiredPortalId === object.id
        ) {
          sendCharacterToArea(
            ioc,
            actor.identity.id,
            destination.value.areaId,
            destination.value.coords,
          );
        }
      }
    }
  };
}

export function sendCharacterToArea(
  ioc: InjectionContainer,
  characterId: CharacterId,
  destinationAreaId: AreaId,
  destinationCoords: Vector<Tile>,
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
    char.movement.coords = destinationCoords;
    return;
  }

  // Persist the area change so that upcoming db sync in the
  // new game service will be able to pick up this character.
  // Include health to prevent race condition where old (potentially dead) state is loaded
  // before the periodic sync can save the current state.
  void ioc
    .get(ctxDb)
    .updateCharactersArea({
      characterId,
      newAreaId: destinationAreaId,
      newCoords: destinationCoords,
      health: char.combat.health,
    })
    .then(async (res) => {
      const logger = ioc.get(ctxLogger);
      if (res.isErr()) {
        logger.error(
          new Error(
            `Could not send character "${characterId}" to area ${describeDestination(destinationAreaId, destinationCoords)}`,
            { cause: res.error.error },
          ),
        );
        return;
      }

      // Since moving to another area means to remove the character from the current game service,
      // any unsynced game state changes related to this character would be lost unless we save them explicitly right now,
      // since regular persistence is done on interval, an interval which we would miss here.
      // Wait for the save to complete to ensure the new game service loads the correct state.
      const saveResult = await ioc.get(ctxDbSyncSession).save(char.identity.id);
      if (saveResult.isErr()) {
        logger.error(saveResult.error, "Failed to save character state before area change");
        return;
      }

      // But if we're moving to a different area we must communicate
      // with other services and tell them to pick up this character.

      // Remove from game state so that clients get updated right away.
      gameState.actors.delete(characterId);

      // Broadcast the area change to other services so that they can
      // flush db sync for this character proactively rather than on poll.
      ioc.get(ctxGameEventClient).network.changeGameService({
        characterId,
        areaId: destinationAreaId,
      });
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

function describeDestination(areaId: AreaId, coords: Vector<Tile>): string {
  return `${areaId} at (${coords.x}, ${coords.y})`;
}
