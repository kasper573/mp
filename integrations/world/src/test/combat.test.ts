import { RiftServer } from "@rift/core";
import { Vector } from "@mp/math";
import { describe, expect, it } from "vitest";
import {
  Alive,
  AttackStats,
  AttackTarget,
  Health,
  LastAttack,
  PlayerControlled,
  Position,
} from "../components";
import { AreaModule } from "../modules/area/module";
import { CombatModule } from "../modules/combat/module";
import type { CombatApi } from "../modules/combat/module";
import { MovementModule } from "../modules/movement/module";
import type { MovementApi } from "../modules/movement/module";
import { createWorld } from "../world";

function makeHarness(): {
  combatApi: CombatApi;
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

  return {
    combatApi,
    movementApi,
    rift,
    tick: (dt) => {
      for (const h of tickHandlers) h(dt);
    },
  };
}

function makeCombatant(
  rift: RiftServer,
  pos: Vector<number>,
  opts: {
    health?: number;
    damage?: number;
    range?: number;
    speed?: number;
  } = {},
) {
  const entity = rift.spawn();
  entity.set(Position, pos);
  entity.set(Health, { current: opts.health ?? 100, max: 100 });
  entity.set(Alive);
  entity.set(AttackStats, {
    damage: opts.damage ?? 10,
    speed: opts.speed ?? 1,
    range: opts.range ?? 1,
  });
  return entity;
}

describe("CombatModule", () => {
  it("attack sets AttackTarget component", () => {
    const { combatApi, rift } = makeHarness();
    const a = makeCombatant(rift, new Vector(0, 0));
    const v = makeCombatant(rift, new Vector(1, 0));
    combatApi.attack(a, v);
    expect(a.has(AttackTarget)).toBe(true);
    expect(a.get(AttackTarget).entityId).toBe(v.id);
  });

  it("applyDamage reduces health and kills at 0", () => {
    const { combatApi, rift } = makeHarness();
    const v = makeCombatant(rift, new Vector(0, 0), { health: 15 });
    combatApi.applyDamage(v, 10);
    expect(v.get(Health).current).toBe(5);
    expect(v.has(Alive)).toBe(true);
    combatApi.applyDamage(v, 10);
    expect(v.get(Health).current).toBe(0);
    expect(v.has(Alive)).toBe(false);
  });

  it("tick applies damage when in range and off cooldown", () => {
    const { combatApi, rift, tick } = makeHarness();
    const a = makeCombatant(rift, new Vector(0, 0), { damage: 25, range: 2 });
    const v = makeCombatant(rift, new Vector(1, 0), { health: 100 });
    combatApi.attack(a, v);
    tick(0.1);
    expect(v.get(Health).current).toBe(75);
    expect(a.has(LastAttack)).toBe(true);
  });

  it("tick respects cooldown between attacks", () => {
    const { combatApi, rift, tick } = makeHarness();
    const a = makeCombatant(rift, new Vector(0, 0), {
      damage: 10,
      range: 2,
      speed: 1,
    });
    const v = makeCombatant(rift, new Vector(1, 0), { health: 100 });
    combatApi.attack(a, v);
    tick(0.1);
    expect(v.get(Health).current).toBe(90);
    tick(0.1);
    expect(v.get(Health).current).toBe(90);
    tick(1.0);
    expect(v.get(Health).current).toBe(80);
  });

  it("tick clears AttackTarget when target dies", () => {
    const { combatApi, rift, tick } = makeHarness();
    const a = makeCombatant(rift, new Vector(0, 0), { damage: 200, range: 2 });
    const v = makeCombatant(rift, new Vector(1, 0), { health: 50 });
    combatApi.attack(a, v);
    tick(0.1);
    expect(v.get(Health).current).toBe(0);
    expect(v.has(Alive)).toBe(false);
    tick(2);
    expect(a.has(AttackTarget)).toBe(false);
  });

  it("player health regenerates every 10s up to max", () => {
    const { rift, tick } = makeHarness();
    const p = rift.spawn();
    p.set(PlayerControlled);
    p.set(Health, { current: 50, max: 100 });
    tick(11);
    expect(p.get(Health).current).toBe(55);
    tick(10);
    expect(p.get(Health).current).toBe(60);
  });

  it("dead players do not regenerate", () => {
    const { rift, tick } = makeHarness();
    const p = rift.spawn();
    p.set(PlayerControlled);
    p.set(Health, { current: 0, max: 100 });
    tick(11);
    expect(p.get(Health).current).toBe(0);
  });
});
