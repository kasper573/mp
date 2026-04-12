import { defineModule } from "@rift/modular";
import type { Entity } from "@rift/core";
import type { Path, Vector, VectorLike } from "@mp/math";
import { nearestCardinalDirection, cardinalDirections } from "@mp/math";
import { TimeSpan } from "@mp/time";
import type { Tile } from "@mp/std";
import {
  Position,
  Movement,
  Combat,
  CharacterIdentity,
  AreaTag,
} from "../components";
import { MoveCommand, RecallCommand } from "../events";
import { moveAlongPath, type MovementState } from "../move-along-path";
import type { AreaResource } from "../area-resource";
import { areaModule } from "./area";
import { sessionModule } from "./session";

/** Server-only state per entity */
interface EntityMovementState {
  path: Path<Tile> | undefined;
  moveTarget: Vector<Tile> | undefined;
}

export const movementModule = defineModule({
  dependencies: [areaModule, sessionModule],
  server: (ctx) => {
    const { areas: areaMap } = ctx.using(areaModule);
    const session = ctx.using(sessionModule);
    const movementStates = new Map<number, EntityMovementState>();

    const actors = ctx.rift.query(Position, Movement);

    function getMovementState(entityId: number): EntityMovementState {
      let state = movementStates.get(entityId);
      if (!state) {
        state = { path: undefined, moveTarget: undefined };
        movementStates.set(entityId, state);
      }
      return state;
    }

    function getAreaForEntity(entity: Entity): AreaResource | undefined {
      if (!entity.has(AreaTag)) {
        return;
      }
      return areaMap.get(session.getEntityArea(entity));
    }

    function findPathForEntity(
      entity: Entity,
      area: AreaResource,
      dest: VectorLike<Tile>,
    ): Path<Tile> | undefined {
      const coords = entity.get(Position);
      const fromNode = area.graph.getProximityNode(coords);
      if (!fromNode) {
        return;
      }
      const destNode = area.graph.getProximityNode(dest);
      if (!destNode) {
        return;
      }
      return area.graph.findPath(fromNode, destNode);
    }

    // Handle move commands from clients
    ctx.rift.on(MoveCommand, (clientId, data) => {
      if (!session.hasRole(clientId, "character.move")) return;
      const entity = session.clientEntities.get(clientId);
      if (!entity) {
        return;
      }

      const mState = getMovementState(entity.id);
      mState.moveTarget = { x: data.x, y: data.y } as Vector<Tile>;
    });

    // Handle recall commands from clients
    ctx.rift.on(RecallCommand, (clientId) => {
      if (!session.hasRole(clientId, "character.recall")) return;
      const entity = session.clientEntities.get(clientId);
      if (!entity) return;
      if (entity.has(Combat) && !entity.get(Combat).alive) return;

      const areaId = session.getEntityArea(entity);
      const area = areaMap.get(areaId);
      if (!area) return;

      entity.set(Position, area.start);
      const mState = movementStates.get(entity.id);
      if (mState) {
        mState.path = undefined;
        mState.moveTarget = undefined;
      }
      if (entity.get(Movement).moving) {
        entity.set(Movement, { ...entity.get(Movement), moving: false });
      }
    });

    ctx.onTick((dt) => {
      const delta = TimeSpan.fromSeconds(dt);

      for (const entity of actors.value) {
        // Dead entities don't move
        if (entity.has(Combat) && !entity.get(Combat).alive) {
          const mState = movementStates.get(entity.id);
          if (mState) {
            mState.path = undefined;
            mState.moveTarget = undefined;
          }
          if (entity.get(Movement).moving) {
            entity.set(Movement, { ...entity.get(Movement), moving: false });
          }
          continue;
        }

        const area = getAreaForEntity(entity);
        if (!area) {
          continue;
        }

        const mState = getMovementState(entity.id);

        // Consume move target → path
        if (mState.moveTarget) {
          mState.path = findPathForEntity(entity, area, mState.moveTarget);
          mState.moveTarget = undefined;
        }

        if (!mState.path) {
          // Sync moving=false if needed
          if (entity.get(Movement).moving) {
            entity.set(Movement, { ...entity.get(Movement), moving: false });
          }
          continue;
        }

        // Interpolate along path
        const movement = entity.get(Movement);
        const coords = entity.get(Position);
        const prevX = coords.x;
        const prevY = coords.y;
        const state: MovementState = {
          coords,
          speed: movement.speed,
          path: mState.path,
        };

        moveAlongPath(state, delta);

        entity.set(Position, state.coords);
        mState.path = state.path;

        // Update facing direction from movement delta
        const dx = state.coords.x - prevX;
        const dy = state.coords.y - prevY;
        let newDir = movement.dir;
        if (dx !== 0 || dy !== 0) {
          const angle = Math.atan2(dy, dx);
          const direction = nearestCardinalDirection(angle);
          newDir = cardinalDirections.indexOf(direction);
        }

        // Sync moving flag and direction
        const isMoving = !!state.path;
        if (movement.moving !== isMoving || movement.dir !== newDir) {
          entity.set(Movement, { ...movement, moving: isMoving, dir: newDir });
        }

        // Process portals (characters only)
        if (entity.has(CharacterIdentity)) {
          checkPortals(entity, area, state.coords, mState);
        }
      }
    });

    function checkPortals(
      entity: Entity,
      area: AreaResource,
      coords: Vector<Tile>,
      mState: EntityMovementState,
    ) {
      const worldCoord = area.tiled.tileCoordToWorld(coords);
      const hitObjects = area.hitTestObjects(worldCoord);
      for (const portal of area.portals) {
        if (!hitObjects.includes(portal.object)) continue;
        const dest = portal.destination;
        const destArea = areaMap.get(dest.areaId);
        if (!destArea) break;
        entity.set(Position, dest.coords);
        session.setEntityArea(entity, dest.areaId);
        mState.path = undefined;
        break;
      }
    }

    // Cleanup on entity destroy
    actors.onChange((event) => {
      if (event.type === "removed") {
        movementStates.delete(event.entity.id);
      }
    });

    return {
      api: {
        setMoveTarget(entity: Entity, target: Vector<Tile>) {
          getMovementState(entity.id).moveTarget = target;
        },
        setPath(entity: Entity, path: Path<Tile>) {
          const mState = getMovementState(entity.id);
          mState.path = path;
          mState.moveTarget = undefined;
        },
        clearPath(entity: Entity) {
          const mState = movementStates.get(entity.id);
          if (mState) {
            mState.path = undefined;
            mState.moveTarget = undefined;
          }
        },
        hasPath(entity: Entity): boolean {
          return !!movementStates.get(entity.id)?.path;
        },
        findPathForEntity,
      },
    };
  },
});
