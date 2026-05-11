import type { Cleanup, Feature } from "../feature";
import type { ClientId, RiftServer } from "@rift/core";
import { Tick } from "@rift/core";
import { combine, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { Vector } from "@mp/math";
import type { AreaResource } from "../area/area-resource";
import { hitTestTiledObject } from "../area/hit-test";
import type { AreaId } from "@mp/fixtures";
import { AreaTag } from "../area/components";
import { entityForClient } from "../identity/session-registry";
import { Movement, PathFollow, type CardinalDirection } from "./components";
import { MoveRequest, MoveToPortal } from "./events";
import { Combat } from "../combat/components";

export interface MovementFeatureOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export function movementFeature(opts: MovementFeatureOptions): Feature {
  return {
    server(server): Cleanup {
      return combine(
        server.on(MoveRequest, (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          beginCharacterMove(
            server,
            opts,
            event.source.clientId,
            event.data,
            undefined,
          );
        }),

        server.on(MoveToPortal, (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          beginCharacterMove(
            server,
            opts,
            event.source.clientId,
            event.data.movement,
            event.data.portalId,
          );
        }),

        server.on(Tick, (event) => {
          const dt = event.data.dt;
          for (const [id, mv, areaTag] of server.world.query(
            Movement,
            AreaTag,
          )) {
            const combat = server.world.get(id, Combat);
            if (combat && !combat.alive) {
              server.world.remove(id, PathFollow);
              if (mv.moveTarget) {
                server.world.write(id, Movement, { moveTarget: undefined });
              }
              continue;
            }
            const area = opts.areas.get(areaTag.areaId);
            if (!area) {
              continue;
            }

            let path = server.world.get(id, PathFollow)?.path;
            if ((!path || path.length === 0) && mv.moveTarget) {
              const computed = findPath(area, mv.coords, mv.moveTarget);
              if (computed && computed.length > 0) {
                server.world.upsert(id, PathFollow, { path: computed });
                path = computed;
              } else {
                server.world.remove(id, PathFollow);
                server.world.write(id, Movement, { moveTarget: undefined });
                continue;
              }
            }

            if (!path || path.length === 0) {
              continue;
            }

            const stepped = stepAlongPath(mv, path, dt);
            server.world.write(id, Movement, {
              coords: stepped.coords,
              direction: stepped.direction,
            });
            if (stepped.path.length === 0) {
              server.world.remove(id, PathFollow);
              server.world.write(id, Movement, { moveTarget: undefined });
            } else {
              server.world.upsert(id, PathFollow, { path: stepped.path });
            }

            if (mv.desiredPortalId !== undefined) {
              const portal = findPortalById(area, mv.desiredPortalId);
              const worldPos = area.tiled.tileCoordToWorld(stepped.coords);
              if (
                portal &&
                hitTestTiledObject(portal.object, worldPos) &&
                opts.areas.has(portal.destination.areaId)
              ) {
                server.world.remove(id, PathFollow);
                server.world.write(id, AreaTag, {
                  areaId: portal.destination.areaId,
                });
                server.world.write(id, Movement, {
                  coords: portal.destination.coords,
                  moveTarget: undefined,
                  desiredPortalId: undefined,
                });
              }
            }
          }
        }),
      );
    },
  };
}

export function directionBetween(
  from: Vector<Tile>,
  to: Vector<Tile>,
): CardinalDirection {
  return dirFromDelta(to.x - from.x, to.y - from.y);
}

export function findPath(
  area: AreaResource,
  from: Vector<Tile>,
  to: Vector<Tile>,
): ReadonlyArray<Vector<Tile>> | undefined {
  const fromNode = area.graph.getProximityNode(from);
  const toNode = area.graph.getProximityNode(to);
  if (!fromNode || !toNode) {
    return;
  }
  const path = area.graph.findPath(fromNode, toNode);
  if (!path) {
    return;
  }
  return path;
}

type Path = ReadonlyArray<Vector<Tile>>;

interface StepResult {
  coords: Vector<Tile>;
  direction: CardinalDirection;
  path: Path;
}

function beginCharacterMove(
  server: RiftServer,
  opts: MovementFeatureOptions,
  clientId: ClientId,
  target: Vector<Tile>,
  desiredPortalId: ObjectId | undefined,
): void {
  const characterEnt = entityForClient(server.world, clientId);
  if (characterEnt === undefined) {
    return;
  }
  const [movement, tag, combat] = server.world.get(
    characterEnt,
    Movement,
    AreaTag,
    Combat,
  );
  if (!movement || !tag) {
    return;
  }
  const area = opts.areas.get(tag.areaId);
  if (!area) {
    return;
  }
  const path = findPath(area, movement.coords, target);
  if (path) {
    server.world.upsert(characterEnt, PathFollow, { path });
  } else {
    server.world.remove(characterEnt, PathFollow);
  }
  server.world.write(characterEnt, Movement, {
    moveTarget: target,
    desiredPortalId,
  });
  if (combat?.attackTargetId !== undefined) {
    server.world.write(characterEnt, Combat, { attackTargetId: undefined });
  }
}

function findPortalById(area: AreaResource, portalId: ObjectId) {
  for (const portal of area.portals) {
    if (portal.object.id === portalId) {
      return portal;
    }
  }
  return undefined;
}

function stepAlongPath(
  mv: { coords: Vector<Tile>; speed: Tile; direction: CardinalDirection },
  path: Path,
  dt: number,
): StepResult {
  let distanceToMove = mv.speed * dt;
  if (!distanceToMove || path.length === 0) {
    return { coords: mv.coords, direction: mv.direction, path };
  }
  let coords = mv.coords;
  let direction: CardinalDirection = mv.direction;
  let pathIndex = 0;
  const lastIndex = path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const dest = path[pathIndex];
    const dx = dest.x - coords.x;
    const dy = dest.y - coords.y;
    const distanceToDest = Math.hypot(dx, dy);
    direction = dirFromDelta(dx, dy);
    if (distanceToMove > distanceToDest) {
      distanceToMove -= distanceToDest;
      coords = dest;
      pathIndex++;
    } else {
      const pct = distanceToMove / distanceToDest;
      coords = new Vector(
        (coords.x + dx * pct) as Tile,
        (coords.y + dy * pct) as Tile,
      );
      break;
    }
  }
  const remaining: Path = pathIndex > lastIndex ? [] : path.slice(pathIndex);
  return { coords, direction, path: remaining };
}

function dirFromDelta(dx: number, dy: number): CardinalDirection {
  const angle = Math.atan2(dy, dx);
  const slice = Math.PI / 4;
  if (angle >= -slice / 2 && angle < slice / 2) {
    return "e";
  }
  if (angle >= slice / 2 && angle < (3 * slice) / 2) {
    return "se";
  }
  if (angle >= (3 * slice) / 2 && angle < (5 * slice) / 2) {
    return "s";
  }
  if (angle >= (5 * slice) / 2 && angle < (7 * slice) / 2) {
    return "sw";
  }
  if (angle >= (7 * slice) / 2 || angle < -(7 * slice) / 2) {
    return "w";
  }
  if (angle >= -(7 * slice) / 2 && angle < -(5 * slice) / 2) {
    return "nw";
  }
  if (angle >= -(5 * slice) / 2 && angle < -(3 * slice) / 2) {
    return "n";
  }
  return "ne";
}
