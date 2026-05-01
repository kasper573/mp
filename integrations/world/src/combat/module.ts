import type { Cleanup } from "@rift/module";
import type { inferServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import { combine } from "@mp/std";
import { inject } from "@rift/module";
import { ClientCharacterRegistry } from "../identity/client-character-registry";
import { CharacterTag, NpcTag } from "../identity/components";
import { Combat } from "./components";
import { Movement } from "../movement/components";
import { directionBetween } from "../movement/module";
import { Attacked, AttackRequest, Died, Kill } from "./events";

const HP_REGEN_INTERVAL_MS = 10_000;
const HP_REGEN_AMOUNT = 5;
const TILE_DIAGONAL_MARGIN = Math.sqrt(2) - 1;
const CHASE_RETARGET_THRESHOLD = 1.5;

export class CombatModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  #lastRegenMs = 0;
  #elapsedMs = 0;

  init(): Cleanup {
    return combine(
      this.server.on(Tick, this.#onTick),
      this.server.on(AttackRequest, this.#onAttackRequest),
    );
  }

  #onAttackRequest = (event: inferServerEvent<typeof AttackRequest>): void => {
    if (event.source.type !== "wire") {
      return;
    }
    const attacker = this.registry.getCharacterEntity(event.source.clientId);
    if (attacker === undefined) {
      return;
    }
    const combat = this.server.world.get(attacker, Combat);
    if (!combat || !combat.alive) {
      return;
    }
    this.server.world.set(attacker, Combat, {
      ...combat,
      attackTargetId: event.data,
    });
  };

  #onTick = (event: inferServerEvent<typeof Tick>): void => {
    this.#elapsedMs += event.data.dt * 1000;

    if (this.#elapsedMs - this.#lastRegenMs >= HP_REGEN_INTERVAL_MS) {
      this.#lastRegenMs = this.#elapsedMs;
      for (const [id, , combat] of this.server.world.query(
        CharacterTag,
        Combat,
      )) {
        if (!combat.alive) continue;
        const next = Math.min(
          combat.health + HP_REGEN_AMOUNT,
          combat.maxHealth,
        );
        if (next !== combat.health) {
          this.server.world.set(id, Combat, { ...combat, health: next });
        }
      }
    }

    for (const [id, combat, mv] of this.server.world.query(Combat, Movement)) {
      if (!combat.attackTargetId || !combat.alive) {
        continue;
      }
      const target = combat.attackTargetId;
      const targetCombat = this.server.world.get(target, Combat);
      const targetMv = this.server.world.get(target, Movement);
      if (!targetCombat || !targetMv || !targetCombat.alive) {
        this.server.world.set(id, Combat, {
          ...combat,
          attackTargetId: undefined,
        });
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
          this.server.world.set(id, Movement, {
            ...mv,
            path: [],
            moveTarget: targetMv.coords,
          });
        }
        continue;
      }

      const cooldownMs = (1 / combat.attackSpeed) * 1000;
      if (
        combat.lastAttackMs !== undefined &&
        this.#elapsedMs - combat.lastAttackMs < cooldownMs
      ) {
        continue;
      }

      const newHealth = Math.max(0, targetCombat.health - combat.attackDamage);
      const newAlive = newHealth > 0;
      this.server.world.set(target, Combat, {
        ...targetCombat,
        health: newHealth,
        alive: newAlive,
      });

      this.server.world.set(id, Combat, {
        ...combat,
        lastAttackMs: this.#elapsedMs,
      });
      this.server.world.set(id, Movement, {
        ...mv,
        path: [],
        moveTarget: undefined,
        direction: directionBetween(mv.coords, targetMv.coords),
      });

      this.server.emit({
        type: Attacked,
        data: { entityId: id, targetId: target },
        source: { type: "local" },
        target: { type: "wire", strategy: { type: "broadcast" } },
      });

      if (!newAlive) {
        this.server.emit({
          type: Kill,
          data: { attackerId: id, victimId: target },
          source: { type: "local" },
          target: { type: "local" },
        });
        this.server.emit({
          type: Died,
          data: target,
          source: { type: "local" },
          target: { type: "wire", strategy: { type: "broadcast" } },
        });
        if (this.server.world.has(target, NpcTag)) {
          this.server.world.set(target, Movement, {
            ...targetMv,
            path: [],
            moveTarget: undefined,
          });
        }
      }
    }
  };
}
