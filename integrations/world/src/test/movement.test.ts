import { RiftServer } from "@rift/core";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { VectorGraph } from "@mp/path-finding";
import { describe, expect, it } from "vitest";
import type { AreaResource } from "../area";
import {
  AreaMember,
  MovementSpeed,
  MoveTarget,
  Path,
  Position,
} from "../components";
import type { AreaId } from "../domain-ids";
import { AreaModule } from "../modules/area/module";
import type { AreaApi } from "../modules/area/module";
import { MovementModule } from "../modules/movement/module";
import type { MovementApi } from "../modules/movement/module";
import { createWorld } from "../world";

function makeLinearAreaResource(id: AreaId, length: number): AreaResource {
  const graph = new VectorGraph<Tile>();
  graph.beginUpdate();
  const points: Vector<Tile>[] = [];
  for (let i = 0; i < length; i++) {
    const v = new Vector(i as Tile, 0 as Tile);
    points.push(v);
    graph.addNode(v);
  }
  for (let i = 0; i < length - 1; i++) {
    graph.addLink(points[i], points[i + 1]);
    graph.addLink(points[i + 1], points[i]);
  }
  graph.endUpdate();
  return {
    id,
    graph,
    portals: [],
    tiled: {
      tileCoordToWorld: (v: Vector<Tile>) => v,
    },
    hitTestObjects: () => [],
  } as unknown as AreaResource;
}

function makeHarness(): {
  areaApi: AreaApi;
  movementApi: MovementApi;
  rift: RiftServer;
  tick: (dt: number) => void;
} {
  const rift = new RiftServer(createWorld());
  const tickHandlers: Array<(dt: number) => void> = [];
  const stubCtx = {
    rift,
    wss: { on: () => {} },
    values: {},
    addClient: () => {},
    removeClient: () => {},
    using: () => ({}) as never,
    onTick: (handler: (dt: number) => void) => {
      tickHandlers.push(handler);
    },
  };

  const areaResult = AreaModule.server!(stubCtx);
  const areaApi = (areaResult as { api: AreaApi }).api;

  const movementResult = MovementModule.server!({
    ...stubCtx,
    using: ((m: unknown) =>
      m === AreaModule ? areaApi : ({} as never)) as never,
  });
  const movementApi = (movementResult as { api: MovementApi }).api;

  return {
    areaApi,
    movementApi,
    rift,
    tick: (dt) => {
      for (const h of tickHandlers) h(dt);
    },
  };
}

describe("MovementModule", () => {
  it("requestMove sets MoveTarget component", () => {
    const { movementApi, rift } = makeHarness();
    const entity = rift.spawn();
    movementApi.requestMove(entity, { x: 5, y: 3 });
    expect(entity.has(MoveTarget)).toBe(true);
    const target = entity.get(MoveTarget);
    expect(target).toBeInstanceOf(Vector);
    expect(target.x).toBe(5);
    expect(target.y).toBe(3);
  });

  it("cancelMove clears MoveTarget and Path", () => {
    const { movementApi, rift } = makeHarness();
    const entity = rift.spawn();
    entity.set(Path, [new Vector(1, 1)]);
    movementApi.requestMove(entity, { x: 5, y: 0 });
    movementApi.cancelMove(entity);
    expect(entity.has(MoveTarget)).toBe(false);
    expect(entity.has(Path)).toBe(false);
  });

  it("tick pathfinds from MoveTarget then advances Position along the path", () => {
    const { areaApi, movementApi, rift, tick } = makeHarness();
    const areaId = "a1" as AreaId;
    areaApi.registerArea(makeLinearAreaResource(areaId, 5));

    const entity = rift.spawn();
    entity.set(Position, new Vector(0, 0));
    entity.set(MovementSpeed, { speed: 1 });
    entity.set(AreaMember, { areaId });
    movementApi.requestMove(entity, { x: 4, y: 0 });

    tick(1);
    expect(entity.has(MoveTarget)).toBe(false);
    expect(entity.has(Path)).toBe(true);
    const pos1 = entity.get(Position);
    expect(pos1).toBeInstanceOf(Vector);
    expect(pos1.x).toBeCloseTo(1);
    expect(pos1.y).toBeCloseTo(0);

    tick(3);
    const pos2 = entity.get(Position);
    expect(pos2.x).toBeCloseTo(4);
    expect(entity.has(Path)).toBe(false);
  });

  it("tick is a no-op when entity lacks AreaMember", () => {
    const { movementApi, rift, tick } = makeHarness();
    const entity = rift.spawn();
    entity.set(Position, new Vector(0, 0));
    entity.set(MovementSpeed, { speed: 1 });
    movementApi.requestMove(entity, { x: 3, y: 0 });
    tick(1);
    expect(entity.has(MoveTarget)).toBe(true);
    expect(entity.has(Path)).toBe(false);
    expect(entity.get(Position).x).toBe(0);
  });
});
