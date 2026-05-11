import type { Cleanup, Feature } from "../feature";
import { Tick } from "@rift/core";
import { combine } from "@mp/std";
import {
  entityForClient,
  type SessionRegistry,
} from "../identity/session-registry";
import { CharacterTag, NpcTag } from "../identity/components";
import { Combat } from "./components";
import { Movement, PathFollow } from "../movement/components";
import { directionBetween } from "../movement/feature";
import { Attacked, AttackRequest, Died, Kill } from "./events";

const HP_REGEN_INTERVAL_MS = 10_000;
const HP_REGEN_AMOUNT = 5;
const TILE_DIAGONAL_MARGIN = Math.sqrt(2) - 1;
const CHASE_RETARGET_THRESHOLD = 1.5;

export interface CombatFeatureOptions {
  readonly registry: SessionRegistry;
}

export function combatFeature(opts: CombatFeatureOptions): Feature {
  return {
    server(server): Cleanup {
      let lastRegenMs = 0;
      let elapsedMs = 0;

      return combine(
        server.on(AttackRequest, (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          const attacker = entityForClient(
            opts.registry,
            event.source.clientId,
          );
          if (attacker === undefined) {
            return;
          }
          const combat = server.world.get(attacker, Combat);
          if (!combat || !combat.alive) {
            return;
          }
          server.world.write(attacker, Combat, {
            attackTargetId: event.data,
          });
        }),

        server.on(Tick, (event) => {
          elapsedMs += event.data.dt * 1000;

          if (elapsedMs - lastRegenMs >= HP_REGEN_INTERVAL_MS) {
            lastRegenMs = elapsedMs;
            for (const [id, , combat] of server.world.query(
              CharacterTag,
              Combat,
            )) {
              if (!combat.alive) {
                continue;
              }
              const next = Math.min(
                combat.health + HP_REGEN_AMOUNT,
                combat.maxHealth,
              );
              if (next !== combat.health) {
                server.world.write(id, Combat, { health: next });
              }
            }
          }

          for (const [id, combat, mv] of server.world.query(Combat, Movement)) {
            if (!combat.attackTargetId || !combat.alive) {
              continue;
            }
            const target = combat.attackTargetId;
            const [targetCombat, targetMv] = server.world.get(
              target,
              Combat,
              Movement,
            );
            if (!targetCombat || !targetMv || !targetCombat.alive) {
              server.world.write(id, Combat, { attackTargetId: undefined });
              continue;
            }
            const distance = mv.coords.distance(targetMv.coords);
            if (distance > combat.attackRange + TILE_DIAGONAL_MARGIN) {
              const movingTowardTarget =
                mv.moveTarget?.isWithinDistance(
                  targetMv.coords,
                  CHASE_RETARGET_THRESHOLD,
                ) ?? false;
              if (!movingTowardTarget) {
                server.world.remove(id, PathFollow);
                server.world.write(id, Movement, {
                  moveTarget: targetMv.coords,
                });
              }
              continue;
            }

            const cooldownMs = (1 / combat.attackSpeed) * 1000;
            if (
              combat.lastAttackMs !== undefined &&
              elapsedMs - combat.lastAttackMs < cooldownMs
            ) {
              continue;
            }

            const newHealth = Math.max(
              0,
              targetCombat.health - combat.attackDamage,
            );
            const newAlive = newHealth > 0;
            server.world.write(target, Combat, {
              health: newHealth,
              alive: newAlive,
            });

            server.world.write(id, Combat, { lastAttackMs: elapsedMs });
            server.world.remove(id, PathFollow);
            server.world.write(id, Movement, {
              moveTarget: undefined,
              direction: directionBetween(mv.coords, targetMv.coords),
            });

            server.emit({
              type: Attacked,
              data: { entityId: id, targetId: target },
              source: { type: "local" },
              target: { type: "wire", strategy: { type: "broadcast" } },
            });

            if (!newAlive) {
              server.emit({
                type: Kill,
                data: { attackerId: id, victimId: target },
                source: { type: "local" },
                target: { type: "local" },
              });
              server.emit({
                type: Died,
                data: target,
                source: { type: "local" },
                target: { type: "wire", strategy: { type: "broadcast" } },
              });
              if (server.world.has(target, NpcTag)) {
                server.world.remove(target, PathFollow);
                server.world.write(target, Movement, { moveTarget: undefined });
              }
            }
          }
        }),
      );
    },
  };
}
