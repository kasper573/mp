import { RiftServer } from "@rift/core";
import { Vector } from "@mp/math";
import { describe, expect, it } from "vitest";
import {
  Alive,
  Health,
  NpcActor,
  NpcMeta,
  Patrol,
  Position,
} from "../components";
import type { AreaId, NpcDefinitionId, NpcSpawnId } from "../domain-ids";
import { AreaModule } from "../modules/area/module";
import { NpcSpawnerModule } from "../modules/npc-spawner/module";
import type {
  NpcSpawnDef,
  NpcSpawnerApi,
  NpcTemplate,
} from "../modules/npc-spawner/module";
import { createWorld } from "../world";

function makeHarness(): {
  api: NpcSpawnerApi;
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
  const areaApi = (areaResult as { api: unknown }).api;

  const result = NpcSpawnerModule.server!({
    ...stubCtx,
    using: ((m: unknown) =>
      m === AreaModule ? areaApi : ({} as never)) as never,
  });
  const api = (result as { api: NpcSpawnerApi }).api;

  return {
    api,
    rift,
    tick: (dt) => {
      for (const h of tickHandlers) h(dt);
    },
  };
}

const areaA = "a1" as AreaId;

function makeTemplate(): NpcTemplate {
  return {
    definitionId: "nd" as NpcDefinitionId,
    npcType: "aggressive",
    aggroRange: 5,
    movementSpeed: 1,
    maxHealth: 100,
    attackStats: { damage: 10, speed: 1, range: 1 },
    appearance: {
      name: "Goblin",
      modelId: "" as NpcTemplate["appearance"]["modelId"],
      color: 0xff_00_00,
      opacity: 1,
    },
  };
}

function makeSpawn(overrides: Partial<NpcSpawnDef> = {}): NpcSpawnDef {
  return {
    spawnId: "sp1" as NpcSpawnId,
    areaId: areaA,
    count: 1,
    position: new Vector(0, 0),
    template: makeTemplate(),
    ...overrides,
  };
}

function countAliveForSpawn(rift: RiftServer, spawnId: NpcSpawnId): number {
  let n = 0;
  for (const e of rift.query(NpcActor, NpcMeta, Health).value) {
    if (e.get(NpcMeta).spawnId !== spawnId) continue;
    if (e.get(Health).current <= 0) continue;
    n++;
  }
  return n;
}

describe("NpcSpawnerModule", () => {
  it("registerSpawn and tick spawns NPCs up to count", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(makeSpawn({ count: 3 }));
    tick(0.1);
    expect(countAliveForSpawn(rift, "sp1" as NpcSpawnId)).toBe(3);
  });

  it("spawned NPC has expected components", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(makeSpawn({ position: new Vector(7, 9), count: 1 }));
    tick(0.1);
    const [npc] = rift
      .query(NpcActor, NpcMeta, Position, Health, Alive)
      .value.filter((e) => e.get(NpcMeta).spawnId === "sp1");
    expect(npc).toBeDefined();
    expect(npc.get(Position).x).toBe(7);
    expect(npc.get(Position).y).toBe(9);
    expect(npc.get(Health).current).toBe(100);
    expect(npc.has(Alive)).toBe(true);
  });

  it("spawn with patrol path attaches Patrol component", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(
      makeSpawn({
        patrol: [new Vector(0, 0), new Vector(5, 0)],
      }),
    );
    tick(0.1);
    const [npc] = rift.query(NpcActor, NpcMeta, Patrol).value;
    expect(npc).toBeDefined();
    expect(npc.get(Patrol).path).toHaveLength(2);
  });

  it("respawns missing NPCs after one dies", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(makeSpawn({ count: 2 }));
    tick(0.1);
    expect(countAliveForSpawn(rift, "sp1" as NpcSpawnId)).toBe(2);

    const [first] = rift.query(NpcActor, NpcMeta, Health).value;
    first.set(Health, { current: 0, max: 100 });
    tick(0.1);
    expect(countAliveForSpawn(rift, "sp1" as NpcSpawnId)).toBe(2);
  });

  it("cleans up corpses after corpse duration", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(makeSpawn({ count: 1 }));
    tick(0.1);

    const [npc] = rift.query(NpcActor, NpcMeta, Health).value;
    const deadId = npc.id;
    npc.set(Health, { current: 0, max: 100 });

    tick(0.1);
    expect(rift.entity(deadId)).toBeDefined();

    tick(6);
    expect(rift.entity(deadId)).toBeUndefined();
  });

  it("unregisterSpawn stops future respawns", () => {
    const { api, rift, tick } = makeHarness();
    api.registerSpawn(makeSpawn({ count: 2 }));
    tick(0.1);
    api.unregisterSpawn("sp1" as NpcSpawnId);
    for (const e of rift.query(NpcActor, NpcMeta, Health).value) {
      e.set(Health, { current: 0, max: 100 });
    }
    tick(6);
    expect(countAliveForSpawn(rift, "sp1" as NpcSpawnId)).toBe(0);
  });

  it("spawnOne returns entity for registered spawn", () => {
    const { api } = makeHarness();
    api.registerSpawn(makeSpawn({ count: 0 }));
    const e = api.spawnOne("sp1" as NpcSpawnId);
    expect(e).toBeDefined();
    expect(e!.has(NpcActor)).toBe(true);
  });

  it("spawnOne returns undefined for unknown spawn", () => {
    const { api } = makeHarness();
    expect(api.spawnOne("nope" as NpcSpawnId)).toBeUndefined();
  });
});
