import type { Cleanup, Feature } from "@rift/feature";
import { Tick, type EntityId, type World } from "@rift/core";
import { combine, type Tile } from "@mp/std";
import { Vector } from "@mp/math";
import type { AreaResource } from "../area/area-resource";
import { hitTestTiledObject } from "../area/hit-test";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { entityForClient } from "../identity/client-character-registry";
import { Movement, PathFollow, type CardinalDirection } from "./components";
import { MoveRequest } from "./events";
import { Combat } from "../combat/components";

type Path = ReadonlyArray<Vector<Tile>>;

export interface MovementFeatureOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export function movementFeature(opts: MovementFeatureOptions): Feature {
  return {
    server(server): Cleanup {
      return combine(
        server.on(MoveRequest, (event) => {
          if (event.source.type !== "wire") return;
          const characterEnt = entityForClient(
            server.world,
            event.source.clientId,
          );
          if (characterEnt === undefined) return;
          const movement = server.world.get(characterEnt, Movement);
          if (!movement) return;
          const tag = server.world.get(characterEnt, AreaTag);
          if (!tag) return;
          const area = opts.areas.get(tag.areaId);
          if (!area) return;
          const path = findPath(area, movement.coords, event.data);
          if (path) writePath(server.world, characterEnt, path);
          else server.world.remove(characterEnt, PathFollow);
          server.world.write(characterEnt, Movement, {
            moveTarget: event.data,
          });
          const combat = server.world.get(characterEnt, Combat);
          if (combat?.attackTargetId !== undefined) {
            server.world.write(characterEnt, Combat, {
              attackTargetId: undefined,
            });
          }
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
            if (!area) continue;

            let path = server.world.get(id, PathFollow)?.path;
            if ((!path || path.length === 0) && mv.moveTarget) {
              const computed = findPath(area, mv.coords, mv.moveTarget);
              if (computed && computed.length > 0) {
                writePath(server.world, id, computed);
                path = computed;
              } else {
                server.world.remove(id, PathFollow);
                server.world.write(id, Movement, { moveTarget: undefined });
                continue;
              }
            }

            if (!path || path.length === 0) continue;

            const stepped = stepAlongPath(mv, path, dt);
            server.world.write(id, Movement, {
              coords: stepped.coords,
              direction: stepped.direction,
            });
            if (stepped.path.length === 0) {
              server.world.remove(id, PathFollow);
              server.world.write(id, Movement, { moveTarget: undefined });
            } else {
              writePath(server.world, id, stepped.path);
            }

            const destination = portalDestinationAt(area, stepped.coords);
            if (destination && opts.areas.has(destination.areaId)) {
              server.world.remove(id, PathFollow);
              server.world.write(id, AreaTag, { areaId: destination.areaId });
              server.world.write(id, Movement, {
                coords: destination.coords,
                moveTarget: undefined,
              });
            }
          }
        }),
      );
    },
  };
}

function writePath(world: World, id: EntityId, path: Path): void {
  if (world.has(id, PathFollow)) {
    world.write(id, PathFollow, { path });
  } else {
    world.add(id, PathFollow, { path });
  }
}

function portalDestinationAt(area: AreaResource, coords: Vector<Tile>) {
  const worldPos = area.tiled.tileCoordToWorld(coords);
  for (const portal of area.portals) {
    if (hitTestTiledObject(portal.object, worldPos)) {
      return portal.destination;
    }
  }
  return undefined;
}

interface StepResult {
  coords: Vector<Tile>;
  direction: CardinalDirection;
  path: Path;
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

export function directionBetween(
  from: Vector<Tile>,
  to: Vector<Tile>,
): CardinalDirection {
  return dirFromDelta(to.x - from.x, to.y - from.y);
}

function dirFromDelta(dx: number, dy: number): CardinalDirection {
  const angle = Math.atan2(dy, dx);
  const slice = Math.PI / 4;
  if (angle >= -slice / 2 && angle < slice / 2) return "e";
  if (angle >= slice / 2 && angle < (3 * slice) / 2) return "se";
  if (angle >= (3 * slice) / 2 && angle < (5 * slice) / 2) return "s";
  if (angle >= (5 * slice) / 2 && angle < (7 * slice) / 2) return "sw";
  if (angle >= (7 * slice) / 2 || angle < -(7 * slice) / 2) return "w";
  if (angle >= -(7 * slice) / 2 && angle < -(5 * slice) / 2) return "nw";
  if (angle >= -(5 * slice) / 2 && angle < -(3 * slice) / 2) return "n";
  return "ne";
}

export function findPath(
  area: AreaResource,
  from: Vector<Tile>,
  to: Vector<Tile>,
): ReadonlyArray<Vector<Tile>> | undefined {
  const fromNode = area.graph.getProximityNode(from);
  const toNode = area.graph.getProximityNode(to);
  if (!fromNode || !toNode) return;
  const path = area.graph.findPath(fromNode, toNode);
  if (!path) return;
  return path;
}
