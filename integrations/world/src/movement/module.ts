import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import { inject } from "@rift/module";
import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";
import type { AreaResource } from "../area/area-resource";
import { hitTestTiledObject } from "../area/hit-test";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { Movement, type CardinalDirection } from "./components";
import { MoveRequest } from "./events";
import { ClientCharacterRegistry } from "../identity/client-character-registry";
import { Combat } from "../combat/components";

export interface MovementModuleOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export class MovementModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  constructor(opts: MovementModuleOptions) {
    super();
    this.#areas = opts.areas;
  }

  init(): Cleanup {
    const offMove = this.server.on(MoveRequest, this.#onMoveRequest);
    const offTick = this.server.on(Tick, this.#onTick);
    return () => {
      offMove();
      offTick();
    };
  }

  #onMoveRequest = (
    event: RiftServerEvent<{ target: { x: Tile; y: Tile } }>,
  ): void => {
    if (event.source.type !== "wire") {
      return;
    }
    const characterEnt = this.registry.getCharacterEntity(
      event.source.clientId,
    );
    if (characterEnt === undefined) {
      return;
    }
    const movement = this.server.world.get(characterEnt, Movement);
    if (!movement) {
      return;
    }
    const tag = this.server.world.get(characterEnt, AreaTag);
    if (!tag) {
      return;
    }
    const area = this.#areas.get(tag.areaId);
    if (!area) {
      return;
    }
    const path = findPath(area, movement.coords, event.data.target);
    this.server.world.set(characterEnt, Movement, {
      ...movement,
      path: path ?? [],
      moveTarget: event.data.target,
    });
  };

  #onTick = (event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    const dt = event.data.dt;
    for (const [id, mv, areaTag] of this.server.world.query(
      Movement,
      AreaTag,
    )) {
      if (mv.path.length === 0) {
        continue;
      }
      const combat = this.server.world.get(id, Combat);
      if (combat && !combat.alive) {
        this.server.world.set(id, Movement, {
          ...mv,
          path: [],
          moveTarget: undefined,
        });
        continue;
      }
      const area = this.#areas.get(areaTag.areaId);
      if (!area) {
        continue;
      }
      const next = stepAlongPath(mv, dt);
      this.server.world.set(id, Movement, next);

      // Warp the entity if their step crossed onto a portal tile, regardless
      // of whether the path is fully consumed yet.
      const destination = portalDestinationAt(area, next.coords);
      if (destination && this.#areas.has(destination.areaId)) {
        this.server.world.set(id, AreaTag, { areaId: destination.areaId });
        this.server.world.set(id, Movement, {
          ...next,
          coords: { x: destination.coords.x, y: destination.coords.y },
          path: [],
          moveTarget: undefined,
        });
      }
    }
  };
}

function portalDestinationAt(area: AreaResource, coords: { x: Tile; y: Tile }) {
  const worldPos = area.tiled.tileCoordToWorld(new Vector(coords.x, coords.y));
  for (const portal of area.portals) {
    if (hitTestTiledObject(portal.object, worldPos)) {
      return portal.destination;
    }
  }
  return undefined;
}

function stepAlongPath(
  mv: {
    coords: { x: Tile; y: Tile };
    speed: Tile;
    direction: CardinalDirection;
    path: ReadonlyArray<{ x: Tile; y: Tile }>;
    moveTarget: { x: Tile; y: Tile } | undefined;
  },
  dt: number,
): typeof mv {
  let distanceToMove = mv.speed * dt;
  if (!distanceToMove || mv.path.length === 0) {
    return mv;
  }
  let coords = { x: mv.coords.x, y: mv.coords.y };
  let direction: CardinalDirection = mv.direction;
  let pathIndex = 0;
  const lastIndex = mv.path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const dest = mv.path[pathIndex];
    const dx = dest.x - coords.x;
    const dy = dest.y - coords.y;
    const distanceToDest = Math.hypot(dx, dy);
    direction = dirFromDelta(dx, dy);
    if (distanceToMove > distanceToDest) {
      distanceToMove -= distanceToDest;
      coords = { x: dest.x, y: dest.y };
      pathIndex++;
    } else {
      const pct = distanceToMove / distanceToDest;
      coords = {
        x: (coords.x + dx * pct) as Tile,
        y: (coords.y + dy * pct) as Tile,
      };
      break;
    }
  }
  const remaining = pathIndex > lastIndex ? [] : mv.path.slice(pathIndex);
  return { ...mv, coords, path: remaining, direction };
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
  from: { x: Tile; y: Tile },
  to: { x: Tile; y: Tile },
): ReadonlyArray<{ x: Tile; y: Tile }> | undefined {
  const fromVec = new Vector(from.x, from.y);
  const toVec = new Vector(to.x, to.y);
  const fromNode = area.graph.getProximityNode(fromVec);
  const toNode = area.graph.getProximityNode(toVec);
  if (!fromNode || !toNode) {
    return;
  }
  const path = area.graph.findPath(fromNode, toNode);
  if (!path) {
    return;
  }
  return path.map((v) => ({ x: v.x, y: v.y }));
}

export type _AssertEntityId = EntityId;
