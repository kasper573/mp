import { defineModule } from "@rift/modular";
import type { Entity, EntityId, Infer } from "@rift/core";
import { clamp } from "@mp/math";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { Position, Movement, Combat, CharacterIdentity } from "../components";
import {
  MoveCommand,
  AttackCommand,
  AttackAnimation,
  DeathAnimation,
  RespawnCommand,
} from "../events";
import { sessionModule } from "./session";
import { movementModule } from "./movement";
import { areaModule } from "./area";

/** sqrt(2) - 1: margin so 1-range attacks can reach diagonal tiles */
const TILE_MARGIN = Math.sqrt(2) - 1;
const HP_REGEN_INTERVAL = 10; // seconds
const HP_REGEN_AMOUNT = 5;

interface CombatState {
  attackTargetId: EntityId | undefined;
  lastAttackTime: number; // elapsed seconds
}

export const combatModule = defineModule({
  dependencies: [areaModule, sessionModule, movementModule],
  server: (ctx) => {
    const session = ctx.using(sessionModule);
    const movement = ctx.using(movementModule);
    const { areas: areaMap } = ctx.using(areaModule);
    const combatStates = new Map<EntityId, CombatState>();
    let totalElapsed = 0;
    let nextHpRegenTime = HP_REGEN_INTERVAL;

    // Per-tick attack/death records (consumed by NPC module)
    let attacksThisTick: { attackerId: EntityId; targetId: EntityId }[] = [];
    let deathsThisTick: { entityId: EntityId; killedBy: EntityId }[] = [];

    const combatants = ctx.rift.query(Position, Movement, Combat);
    const characters = ctx.rift.query(Combat, CharacterIdentity);

    function getCombatState(entityId: EntityId): CombatState {
      let state = combatStates.get(entityId);
      if (!state) {
        state = { attackTargetId: undefined, lastAttackTime: -Infinity };
        combatStates.set(entityId, state);
      }
      return state;
    }

    function canAttackFrom(
      from: Vector<Tile>,
      target: Vector<Tile>,
      range: Tile,
    ): boolean {
      return from.isWithinDistance(target, (range + TILE_MARGIN) as Tile);
    }

    function isTargetable(entity: Entity): boolean {
      return entity.has(Combat) && entity.get(Combat).health > 0;
    }

    // Handle attack commands from clients
    ctx.rift.on(AttackCommand, (clientId, data) => {
      if (!session.hasRole(clientId, "character.attack")) return;
      const entity = session.clientEntities.get(clientId);
      if (!entity) {
        return;
      }
      // Can't attack self
      if (data.targetId === entity.id) {
        return;
      }
      getCombatState(entity.id).attackTargetId = data.targetId;
    });

    // Intentional movement cancels active combat
    ctx.rift.on(MoveCommand, (clientId) => {
      const entity = session.clientEntities.get(clientId);
      if (!entity) return;
      const cState = combatStates.get(entity.id);
      if (cState) {
        cState.attackTargetId = undefined;
      }
    });

    // Handle respawn commands from clients
    ctx.rift.on(RespawnCommand, (clientId) => {
      if (!session.hasRole(clientId, "character.respawn")) return;
      const entity = session.clientEntities.get(clientId);
      if (!entity) return;

      const combat = entity.get(Combat);
      if (combat.alive) return;

      combat.health = combat.maxHealth;
      combat.alive = true;

      // Reset to area spawn point
      const areaId = session.getEntityArea(entity);
      const area = areaMap.get(areaId);
      if (area) {
        entity.set(Position, area.start);
      }

      // Clear combat state
      const cState = combatStates.get(entity.id);
      if (cState) {
        cState.attackTargetId = undefined;
      }
    });

    function moveTowardTarget(
      entity: Entity,
      targetPos: Vector<Tile>,
      attackRange: Tile,
    ) {
      const areaId = session.getEntityArea(entity);
      const area = areaMap.get(areaId);
      if (!area) return;
      const path = movement.findPathForEntity(entity, area, targetPos);
      const bestTile =
        path?.find((tile) => canAttackFrom(tile, targetPos, attackRange)) ??
        targetPos;
      movement.setMoveTarget(entity, bestTile);
    }

    function executeAttack(
      entity: Entity,
      combat: Pick<Infer<typeof Combat>, "attackDamage" | "attackSpeed">,
      target: Entity,
      cState: CombatState,
    ) {
      const attackDelay = 1 / combat.attackSpeed;
      const timeSinceLastAttack = totalElapsed - cState.lastAttackTime;
      if (timeSinceLastAttack < attackDelay) return;

      const targetCombat = target.get(Combat);
      targetCombat.health = Math.max(
        0,
        targetCombat.health - combat.attackDamage,
      );

      cState.lastAttackTime = totalElapsed;
      movement.clearPath(entity);
      attacksThisTick.push({ attackerId: entity.id, targetId: target.id });

      ctx.rift
        .emit(AttackAnimation, {
          attackerId: entity.id,
          targetId: target.id,
        })
        .toObserversOf(entity, target);

      if (targetCombat.health <= 0) {
        ctx.rift
          .emit(DeathAnimation, { entityId: target.id })
          .toObserversOf(target);
      }
    }

    function processAttack(entity: Entity, combat: Infer<typeof Combat>) {
      const cState = combatStates.get(entity.id);
      if (cState?.attackTargetId === undefined) return;

      const target = ctx.rift.entity(cState.attackTargetId);
      if (!target || !isTargetable(target)) {
        cState.attackTargetId = undefined;
        return;
      }

      const entityPos = entity.get(Position);
      const targetPos = target.get(Position);
      if (!canAttackFrom(entityPos, targetPos, combat.attackRange)) {
        moveTowardTarget(entity, targetPos, combat.attackRange);
      } else {
        executeAttack(entity, combat, target, cState);
      }
    }

    function processDeath(entity: Entity, combat: Infer<typeof Combat>) {
      if (combat.health > 0) {
        combat.alive = true;
        return;
      }
      if (combat.alive) {
        const lastAttack = attacksThisTick.findLast(
          (a) => a.targetId === entity.id,
        );
        if (lastAttack) {
          deathsThisTick.push({
            entityId: entity.id,
            killedBy: lastAttack.attackerId,
          });
        }
      }
      combat.alive = false;
      combat.health = 0;
      movement.clearPath(entity);
      const cState = combatStates.get(entity.id);
      if (cState) {
        cState.attackTargetId = undefined;
      }
    }

    ctx.onTick((dt) => {
      totalElapsed += dt;
      attacksThisTick = [];
      deathsThisTick = [];

      // HP regen for alive characters
      if (totalElapsed >= nextHpRegenTime) {
        nextHpRegenTime = totalElapsed + HP_REGEN_INTERVAL;
        for (const entity of characters.value) {
          const combat = entity.get(Combat);
          if (combat.health > 0) {
            combat.health = clamp(
              combat.health + HP_REGEN_AMOUNT,
              0,
              combat.maxHealth,
            );
          }
        }
      }

      // Two passes: resolve all attacks first, then check deaths.
      // Single-pass would miss deaths when the victim entity is iterated
      // before the attacker (processDeath wouldn't see the killing blow).
      for (const entity of combatants.value) {
        processAttack(entity, entity.get(Combat));
      }
      for (const entity of combatants.value) {
        processDeath(entity, entity.get(Combat));
      }
    });

    // Cleanup
    combatants.onChange((event) => {
      if (event.type === "removed") {
        combatStates.delete(event.entity.id);
      }
    });

    return {
      api: {
        setAttackTarget(entity: Entity, targetId: EntityId) {
          getCombatState(entity.id).attackTargetId = targetId;
        },
        clearAttackTarget(entity: Entity) {
          const cs = combatStates.get(entity.id);
          if (cs) {
            cs.attackTargetId = undefined;
          }
        },
        getAttackTarget(entityId: EntityId): EntityId | undefined {
          return combatStates.get(entityId)?.attackTargetId;
        },
        isTargetable,
        get attacksThisTick(): readonly {
          attackerId: EntityId;
          targetId: EntityId;
        }[] {
          return attacksThisTick;
        },
        get deathsThisTick(): readonly {
          entityId: EntityId;
          killedBy: EntityId;
        }[] {
          return deathsThisTick;
        },
      },
    };
  },
});
