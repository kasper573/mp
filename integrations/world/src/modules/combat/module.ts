import type { Entity } from "@rift/core";
import { defineModule } from "@rift/modular";
import type { Vector } from "@mp/math";
import {
  Alive,
  AttackStats,
  AttackTarget,
  ClientSession,
  Health,
  LastAttack,
  MoveTarget,
  Path,
  PlayerControlled,
  Position,
} from "../../components";
import { ActorDied, AttackIntent, DamageDealt } from "../../events";
import { MovementModule } from "../movement/module";

export interface CombatApi {
  attack(attacker: Entity, victim: Entity): void;
  applyDamage(entity: Entity, amount: number): void;
}

const hpRegenIntervalSec = 10;
const hpRegenAmount = 5;
const tileMargin = Math.sqrt(2) - 1;

export const CombatModule = defineModule({
  dependencies: [MovementModule] as const,
  server: (ctx): { api: CombatApi } => {
    const movement = ctx.using(MovementModule);
    let elapsedSec = 0;
    let nextHpRegenSec = hpRegenIntervalSec;

    const attack: CombatApi["attack"] = (attacker, victim) => {
      attacker.set(AttackTarget, { entityId: victim.id });
    };

    const applyDamage: CombatApi["applyDamage"] = (entity, amount) => {
      if (!entity.has(Health)) return;
      const health = entity.get(Health);
      const next = Math.max(0, health.current - amount);
      entity.set(Health, { current: next, max: health.max });
      if (next <= 0) killEntity(entity);
    };

    const killEntity = (entity: Entity) => {
      if (entity.has(Path)) entity.remove(Path);
      if (entity.has(MoveTarget)) entity.remove(MoveTarget);
      if (entity.has(AttackTarget)) entity.remove(AttackTarget);
      if (entity.has(Alive)) entity.remove(Alive);
      ctx.rift.emit(ActorDied, { entityId: entity.id }).toAll();
    };

    ctx.rift.on(AttackIntent, (clientId, data) => {
      const attacker = findEntityByClientId(
        ctx.rift.query(ClientSession).value,
        clientId,
      );
      if (!attacker) return;
      const victim = ctx.rift.entity(data.targetEntityId);
      if (!victim) return;
      attack(attacker, victim);
    });

    ctx.onTick((dt) => {
      elapsedSec += dt;

      if (elapsedSec >= nextHpRegenSec) {
        nextHpRegenSec = elapsedSec + hpRegenIntervalSec;
        for (const entity of ctx.rift.query(PlayerControlled, Health).value) {
          const h = entity.get(Health);
          if (h.current <= 0) continue;
          entity.set(Health, {
            current: Math.min(h.max, h.current + hpRegenAmount),
            max: h.max,
          });
        }
      }

      for (const attacker of ctx.rift.query(AttackTarget, AttackStats, Position)
        .value) {
        tickAttacker(attacker);
      }
    });

    function tickAttacker(attacker: Entity) {
      if (attacker.has(Health) && attacker.get(Health).current <= 0) return;
      const targetId = attacker.get(AttackTarget).entityId;
      const target = ctx.rift.entity(targetId);
      if (!target || !isTargetable(target)) {
        attacker.remove(AttackTarget);
        return;
      }

      const stats = attacker.get(AttackStats);
      const attackerPos = attacker.get(Position);
      const targetPos = target.get(Position);
      const range = stats.range + tileMargin;

      if (!attackerPos.isWithinDistance(targetPos, range)) {
        if (!isMovingTowardsTarget(attacker, targetPos, range)) {
          movement.requestMove(attacker, { x: targetPos.x, y: targetPos.y });
        }
        return;
      }

      if (attacker.has(LastAttack)) {
        const attackDelay = 1 / stats.speed;
        const last = attacker.get(LastAttack).atMs / 1000;
        if (elapsedSec - last < attackDelay) return;
      }

      const targetHealth = target.get(Health);
      const nextHealth = Math.max(0, targetHealth.current - stats.damage);
      target.set(Health, { current: nextHealth, max: targetHealth.max });

      ctx.rift
        .emit(DamageDealt, {
          attackerEntityId: attacker.id,
          victimEntityId: target.id,
          amount: targetHealth.current - nextHealth,
        })
        .toAll();

      if (attacker.has(Path)) attacker.remove(Path);
      attacker.set(LastAttack, { atMs: elapsedSec * 1000 });

      if (nextHealth <= 0) killEntity(target);
    }

    return { api: { attack, applyDamage } };
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

function isTargetable(target: Entity): boolean {
  if (!target.has(Health)) return false;
  return target.get(Health).current > 0;
}

function isMovingTowardsTarget(
  attacker: Entity,
  targetPos: Vector<number>,
  range: number,
): boolean {
  if (!attacker.has(Path)) return false;
  const path = attacker.get(Path);
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].isWithinDistance(targetPos, range)) return true;
  }
  return false;
}
