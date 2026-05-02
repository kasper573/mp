import type { Cleanup } from "@rift/module";
import type { EntityId, inferServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import { inject } from "@rift/module";
import { combine, type Tile } from "@mp/std";
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

type Path = ReadonlyArray<Vector<Tile>>;

export class MovementModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #paths = new Map<EntityId, Path>();

  constructor(opts: MovementModuleOptions) {
    super();
    this.#areas = opts.areas;
  }

  init(): Cleanup {
    return combine(
      this.server.on(MoveRequest, this.#onMoveRequest),
      this.server.on(Tick, this.#onTick),
      () => this.#paths.clear(),
    );
  }

  setPath(entityId: EntityId, path: Path | undefined): void {
    if (!path || path.length === 0) {
      this.#paths.delete(entityId);
    } else {
      this.#paths.set(entityId, path);
    }
  }

  hasPath(entityId: EntityId): boolean {
    return (this.#paths.get(entityId)?.length ?? 0) > 0;
  }

  #onMoveRequest = (event: inferServerEvent<typeof MoveRequest>): void => {
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
    const path = findPath(area, movement.coords, event.data);
    this.setPath(characterEnt, path);
    this.server.world.set(characterEnt, Movement, {
      ...movement,
      moveTarget: event.data,
    });
    const combat = this.server.world.get(characterEnt, Combat);
    if (combat?.attackTargetId !== undefined) {
      this.server.world.set(characterEnt, Combat, {
        ...combat,
        attackTargetId: undefined,
      });
    }
  };

  #onTick = (event: inferServerEvent<typeof Tick>): void => {
    const dt = event.data.dt;
    for (const [id, mv, areaTag] of this.server.world.query(
      Movement,
      AreaTag,
    )) {
      const combat = this.server.world.get(id, Combat);
      if (combat && !combat.alive) {
        this.#paths.delete(id);
        if (mv.moveTarget) {
          mv.moveTarget = undefined;
        }
        continue;
      }
      const area = this.#areas.get(areaTag.areaId);
      if (!area) {
        continue;
      }

      let path = this.#paths.get(id);
      if ((!path || path.length === 0) && mv.moveTarget) {
        const computed = findPath(area, mv.coords, mv.moveTarget);
        if (computed && computed.length > 0) {
          path = computed;
          this.#paths.set(id, path);
        } else {
          this.#paths.delete(id);
          mv.moveTarget = undefined;
          continue;
        }
      }

      if (!path || path.length === 0) {
        continue;
      }

      const stepped = stepAlongPath(mv, path, dt);
      mv.coords = stepped.coords;
      mv.direction = stepped.direction;
      if (stepped.path.length === 0) {
        this.#paths.delete(id);
        mv.moveTarget = undefined;
      } else {
        this.#paths.set(id, stepped.path);
      }

      const destination = portalDestinationAt(area, stepped.coords);
      if (destination && this.#areas.has(destination.areaId)) {
        this.#paths.delete(id);
        this.server.world.set(id, AreaTag, { areaId: destination.areaId });
        mv.coords = destination.coords;
        mv.moveTarget = undefined;
      }
    }
  };
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
  if (!fromNode || !toNode) {
    return;
  }
  const path = area.graph.findPath(fromNode, toNode);
  if (!path) {
    return;
  }
  return path;
}
