import { RiftServer } from "@rift/core";
import { Vector } from "@mp/math";
import { describe, expect, it } from "vitest";
import {
  Alive,
  AttackStats,
  AttackTarget,
  AreaMember,
  Health,
  MovementSpeed,
  NpcActor,
  NpcMeta,
  Patrol,
  Path,
  PlayerControlled,
  Position,
} from "../components";
import type {
  AreaId,
  NpcDefinitionId,
  NpcInstanceId,
  NpcSpawnId,
  NpcType,
} from "../domain-ids";
import { AreaModule } from "../modules/area/module";
import { CombatModule } from "../modules/combat/module";
import type { CombatApi } from "../modules/combat/module";
import { MovementModule } from "../modules/movement/module";
import type { MovementApi } from "../modules/movement/module";
import { NpcAiModule } from "../modules/npc-ai/module";
import type { NpcAiApi } from "../modules/npc-ai/module";
import { createWorld } from "../world";

function makeHarness(): {
  combatApi: CombatApi;
  movementApi: MovementApi;
  npcAiApi: NpcAiApi;
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

  const movementResult = MovementModule.server!({
    ...stubCtx,
    using: ((m: unknown) =>
      m === AreaModule ? areaApi : ({} as never)) as never,
  });
  const movementApi = (movementResult as { api: MovementApi }).api;

  const combatResult = CombatModule.server!({
    ...stubCtx,
    using: ((m: unknown) =>
      m === MovementModule ? movementApi : ({} as never)) as never,
  });
  const combatApi = (combatResult as { api: CombatApi }).api;

  const npcAiResult = NpcAiModule.server!({
    ...stubCtx,
    using: ((m: unknown) => {
      if (m === CombatModule) return combatApi;
      if (m === MovementModule) return movementApi;
      return {} as never;
    }) as never,
  });
  const npcAiApi = (npcAiResult as { api: NpcAiApi }).api;

  return {
    combatApi,
    movementApi,
    npcAiApi,
    rift,
    tick: (dt) => {
      for (const h of tickHandlers) h(dt);
    },
  };
}

const areaA = "a1" as AreaId;

function makeNpc(
  rift: RiftServer,
  pos: Vector<number>,
  opts: {
    type: NpcType;
    aggroRange?: number;
    spawnId?: string;
    health?: number;
    areaId?: AreaId;
  },
) {
  const e = rift.spawn();
  e.set(Position, pos);
  e.set(NpcActor);
  e.set(NpcMeta, {
    instanceId: "ni" as NpcInstanceId,
    definitionId: "nd" as NpcDefinitionId,
    spawnId: (opts.spawnId ?? "sp") as NpcSpawnId,
    npcType: opts.type,
    aggroRange: opts.aggroRange ?? 5,
  });
  e.set(Health, { current: opts.health ?? 100, max: 100 });
  e.set(Alive);
  e.set(AttackStats, { damage: 10, speed: 1, range: 1 });
  e.set(MovementSpeed, { speed: 1 });
  e.set(AreaMember, { areaId: opts.areaId ?? areaA });
  return e;
}

function makePlayer(
  rift: RiftServer,
  pos: Vector<number>,
  opts: { health?: number; areaId?: AreaId } = {},
) {
  const e = rift.spawn();
  e.set(Position, pos);
  e.set(PlayerControlled);
  e.set(Health, { current: opts.health ?? 100, max: 100 });
  e.set(Alive);
  e.set(AttackStats, { damage: 10, speed: 1, range: 1 });
  e.set(AreaMember, { areaId: opts.areaId ?? areaA });
  return e;
}

describe("NpcAiModule", () => {
  it("static npc takes no action", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), { type: "static" });
    makePlayer(rift, new Vector(1, 0));
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(false);
    expect(npc.has(Path)).toBe(false);
  });

  it("pacifist npc never attacks", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), { type: "pacifist" });
    makePlayer(rift, new Vector(1, 0));
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(false);
  });

  it("aggressive npc attacks nearest player in aggro range", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), {
      type: "aggressive",
      aggroRange: 5,
    });
    const far = makePlayer(rift, new Vector(4, 0));
    const near = makePlayer(rift, new Vector(2, 0));
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(true);
    expect(npc.get(AttackTarget).entityId).toBe(near.id);
    void far;
  });

  it("aggressive npc ignores players outside aggro range", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), {
      type: "aggressive",
      aggroRange: 2,
    });
    makePlayer(rift, new Vector(10, 0));
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(false);
  });

  it("aggressive npc ignores players in other areas", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), { type: "aggressive" });
    makePlayer(rift, new Vector(1, 0), { areaId: "b" as AreaId });
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(false);
  });

  it("defensive npc ignores players until witnessing combat", () => {
    const { combatApi, rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), {
      type: "defensive",
      aggroRange: 5,
    });
    const player = makePlayer(rift, new Vector(2, 0));
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(false);

    const other = makePlayer(rift, new Vector(2, 1));
    combatApi.attack(player, other);
    tick(0.1);
    tick(0.1);
    expect(npc.has(AttackTarget)).toBe(true);
  });

  it("protective npc attacks when ally with same spawnId witnessed combat", () => {
    const { combatApi, rift, tick } = makeHarness();
    const ally = makeNpc(rift, new Vector(0, 0), {
      type: "protective",
      spawnId: "pack",
      aggroRange: 5,
    });
    const guard = makeNpc(rift, new Vector(10, 10), {
      type: "protective",
      spawnId: "pack",
      aggroRange: 20,
    });
    const attacker = makePlayer(rift, new Vector(1, 0));
    const victim = makePlayer(rift, new Vector(1, 1));
    combatApi.attack(attacker, victim);
    tick(0.1);
    tick(0.1);
    expect(ally.has(AttackTarget)).toBe(true);
    expect(guard.has(AttackTarget)).toBe(true);
  });

  it("patrol npc walks configured path and reverses on next patrol", () => {
    const { rift, tick } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), { type: "patrol" });
    const p0 = new Vector(0, 0);
    const p1 = new Vector(5, 0);
    npc.set(Patrol, { path: [p0, p1] });
    tick(0.1);
    expect(npc.has(Path)).toBe(true);
    const first = npc.get(Path);
    expect(first[0].x).toBe(0);
    expect(first[1].x).toBe(5);

    npc.remove(Path);
    tick(0.1);
    const second = npc.get(Path);
    expect(second[0].x).toBe(5);
    expect(second[1].x).toBe(0);
  });

  it("dead npc is skipped and memory cleared", () => {
    const { combatApi, rift, tick, npcAiApi } = makeHarness();
    const npc = makeNpc(rift, new Vector(0, 0), {
      type: "defensive",
      health: 100,
    });
    const attacker = makePlayer(rift, new Vector(1, 0));
    const victim = makePlayer(rift, new Vector(1, 1));
    combatApi.attack(attacker, victim);
    tick(0.1);
    expect(npcAiApi.rememberedCombats.get(npc.id)?.size).toBeGreaterThan(0);

    npc.set(Health, { current: 0, max: 100 });
    tick(0.1);
    expect(npcAiApi.rememberedCombats.has(npc.id)).toBe(false);
  });
});
