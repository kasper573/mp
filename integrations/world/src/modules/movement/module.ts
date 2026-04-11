import type { Entity } from "@rift/core";
import { defineModule } from "@rift/modular";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import {
  AreaMember,
  ClientSession,
  DesiredPortal,
  Facing,
  Health,
  MoveTarget,
  MovementSpeed,
  Path,
  Position,
} from "../../components";
import type { AreaId, CardinalDirection, ObjectId } from "../../domain-ids";
import { AreaChanged, MoveIntent } from "../../events";
import { getDestinationFromObject, type AreaResource } from "../../area";
import { AreaModule } from "../area/module";

export interface MovementApi {
  requestMove(
    entity: Entity,
    target: { x: number; y: number },
    portalId?: ObjectId,
  ): void;
  cancelMove(entity: Entity): void;
}

export const MovementModule = defineModule({
  dependencies: [AreaModule] as const,
  server: (ctx): { api: MovementApi } => {
    const areas = ctx.using(AreaModule);

    const requestMove: MovementApi["requestMove"] = (
      entity,
      target,
      portalId,
    ) => {
      entity.set(MoveTarget, new Vector(target.x, target.y));
      if (portalId !== undefined) {
        entity.set(DesiredPortal, { portalId });
      } else if (entity.has(DesiredPortal)) {
        entity.remove(DesiredPortal);
      }
    };

    const cancelMove: MovementApi["cancelMove"] = (entity) => {
      if (entity.has(MoveTarget)) entity.remove(MoveTarget);
      if (entity.has(Path)) entity.remove(Path);
      if (entity.has(DesiredPortal)) entity.remove(DesiredPortal);
    };

    ctx.rift.on(MoveIntent, (clientId, data) => {
      const entity = findEntityByClientId(
        ctx.rift.query(ClientSession).value,
        clientId,
      );
      if (!entity) return;
      const portalId = data.portalId === 0 ? undefined : data.portalId;
      requestMove(entity, { x: data.x, y: data.y }, portalId);
    });

    ctx.onTick((dt) => {
      for (const entity of ctx.rift.query(Position, MovementSpeed).value) {
        tickEntity(entity, dt, areas, (event) => {
          ctx.rift.emit(AreaChanged, event).toAll();
        });
      }
    });

    return { api: { requestMove, cancelMove } };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});

function findEntityByClientId(
  entities: Entity[],
  clientId: string,
): Entity | undefined {
  for (const e of entities) {
    if (e.get(ClientSession).clientId === clientId) return e;
  }
  return undefined;
}

function tickEntity(
  entity: Entity,
  dt: number,
  areas: { getArea(areaId: AreaId): AreaResource | undefined },
  emitAreaChanged: (event: { entityId: number; areaId: AreaId }) => void,
): void {
  if (entity.has(Health) && entity.get(Health).current <= 0) {
    if (entity.has(Path)) entity.remove(Path);
    if (entity.has(MoveTarget)) entity.remove(MoveTarget);
    return;
  }

  const area = entity.has(AreaMember)
    ? areas.getArea(entity.get(AreaMember).areaId)
    : undefined;

  if (entity.has(MoveTarget) && area) {
    const target = entity.get(MoveTarget);
    const pos = entity.get(Position);
    const path = findPath(area, pos, target);
    if (path) entity.set(Path, path);
    else if (entity.has(Path)) entity.remove(Path);
    entity.remove(MoveTarget);
  }

  if (entity.has(Path)) {
    advanceAlongPath(entity, dt);
  }

  if (area) handlePortalTraversal(entity, area, emitAreaChanged);
}

function findPath(
  area: AreaResource,
  from: Vector<number>,
  to: Vector<number>,
): Array<Vector<number>> | undefined {
  const fromNode = area.graph.getProximityNode({
    x: from.x as Tile,
    y: from.y as Tile,
  });
  if (!fromNode) return undefined;
  const toNode = area.graph.getProximityNode({
    x: to.x as Tile,
    y: to.y as Tile,
  });
  if (!toNode) return undefined;
  const result = area.graph.findPath(fromNode, toNode);
  if (!result) return undefined;
  return result.map((v) => new Vector<number>(v.x, v.y));
}

function advanceAlongPath(entity: Entity, dt: number): void {
  const speed = entity.get(MovementSpeed).speed;
  let distanceToMove = speed * dt;
  const path = [...entity.get(Path)];
  const start = entity.get(Position);
  let x = start.x;
  let y = start.y;

  if (!distanceToMove || path.length === 0) {
    if (path.length === 0) entity.remove(Path);
    return;
  }

  let pathIndex = 0;
  const lastIndex = path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const dest = path[pathIndex];
    const dx = dest.x - x;
    const dy = dest.y - y;
    const distanceToDest = Math.sqrt(dx * dx + dy * dy);

    if (distanceToMove >= distanceToDest) {
      distanceToMove -= distanceToDest;
      x = dest.x;
      y = dest.y;
      pathIndex++;
    } else {
      const percentage =
        distanceToDest === 0 ? 1 : distanceToMove / distanceToDest;
      x = x + dx * percentage;
      y = y + dy * percentage;
      break;
    }
  }

  updateFacing(entity, start.x, start.y, x, y);
  entity.set(Position, new Vector(x, y));

  if (pathIndex > lastIndex) {
    entity.remove(Path);
  } else if (pathIndex > 0) {
    entity.set(Path, path.slice(pathIndex));
  }
}

function updateFacing(
  entity: Entity,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return;
  const dir = cardinalFromDelta(dx, dy);
  if (entity.has(Facing)) {
    entity.get(Facing).dir = dir;
  } else {
    entity.set(Facing, { dir });
  }
}

function cardinalFromDelta(dx: number, dy: number): CardinalDirection {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg >= -22.5 && deg < 22.5) return "e";
  if (deg >= 22.5 && deg < 67.5) return "se";
  if (deg >= 67.5 && deg < 112.5) return "s";
  if (deg >= 112.5 && deg < 157.5) return "sw";
  if (deg >= 157.5 || deg < -157.5) return "w";
  if (deg >= -157.5 && deg < -112.5) return "nw";
  if (deg >= -112.5 && deg < -67.5) return "n";
  return "ne";
}

function handlePortalTraversal(
  entity: Entity,
  area: AreaResource,
  emitAreaChanged: (event: { entityId: number; areaId: AreaId }) => void,
): void {
  if (!entity.has(DesiredPortal)) return;
  const desiredPortalId = entity.get(DesiredPortal).portalId;
  const pos = entity.get(Position);
  const tileCoord = new Vector(pos.x as Tile, pos.y as Tile);
  const worldCoord = area.tiled.tileCoordToWorld(tileCoord);
  for (const obj of area.hitTestObjects(worldCoord)) {
    if (obj.id !== Number(desiredPortalId)) continue;
    const destination = getDestinationFromObject(obj);
    if (!destination?.isOk()) continue;
    const { areaId, coords } = destination.value;
    entity.remove(DesiredPortal);
    if (entity.has(Path)) entity.remove(Path);
    entity.set(Position, new Vector(coords.x, coords.y));
    if (areaId !== area.id) {
      entity.set(AreaMember, { areaId });
      emitAreaChanged({ entityId: entity.id, areaId });
    }
    return;
  }
}
