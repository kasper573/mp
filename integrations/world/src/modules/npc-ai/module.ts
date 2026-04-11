import type { Entity, EntityId } from "@rift/core";
import { defineModule } from "@rift/modular";
import { Vector } from "@mp/math";
import {
  AreaMember,
  AttackTarget,
  Health,
  MovementSpeed,
  NpcActor,
  NpcMeta,
  Patrol,
  Path,
  PlayerControlled,
  Position,
} from "../../components";
import type { AreaId } from "../../domain-ids";
import { CombatModule } from "../combat/module";
import { MovementModule } from "../movement/module";

export interface NpcAiApi {
  readonly rememberedCombats: ReadonlyMap<EntityId, ReadonlySet<EntityId>>;
}

export const NpcAiModule = defineModule({
  dependencies: [CombatModule, MovementModule] as const,
  server: (ctx): { api: NpcAiApi } => {
    const combat = ctx.using(CombatModule);
    const movement = ctx.using(MovementModule);

    // observerId -> set of entityIds it has seen in combat (attackers + victims)
    const memory = new Map<EntityId, Set<EntityId>>();
    const patrolState = new Map<EntityId, { reversed: boolean }>();

    combat.onDamageDealt((data) => {
      for (const npc of ctx.rift.query(NpcActor, NpcMeta, Position).value) {
        const aggro = npc.get(NpcMeta).aggroRange;
        const npcPos = npc.get(Position);
        const attacker = ctx.rift.entity(data.attackerEntityId);
        const victim = ctx.rift.entity(data.victimEntityId);
        const witnessed =
          (attacker?.has(Position) &&
            npcPos.isWithinDistance(attacker.get(Position), aggro)) ||
          (victim?.has(Position) &&
            npcPos.isWithinDistance(victim.get(Position), aggro));
        if (!witnessed) continue;
        let set = memory.get(npc.id);
        if (!set) {
          set = new Set();
          memory.set(npc.id, set);
        }
        set.add(data.attackerEntityId);
        set.add(data.victimEntityId);
      }
    });

    ctx.onTick(() => {
      for (const npc of ctx.rift.query(NpcActor, NpcMeta, Position).value) {
        if (npc.has(Health) && npc.get(Health).current <= 0) {
          memory.delete(npc.id);
          patrolState.delete(npc.id);
          continue;
        }
        tickNpc(npc);
      }

      const alive = new Set<EntityId>();
      for (const e of ctx.rift.query(Position).value) alive.add(e.id);
      for (const observerId of [...memory.keys()]) {
        const set = memory.get(observerId);
        if (!set) continue;
        for (const id of [...set]) if (!alive.has(id)) set.delete(id);
      }
    });

    function tickNpc(npc: Entity) {
      const meta = npc.get(NpcMeta);
      switch (meta.npcType) {
        case "static":
        case "pacifist":
          return;
        case "patrol":
          runPatrol(npc);
          return;
        case "aggressive":
          hunt(npc, aggressiveFilter);
          return;
        case "defensive":
          hunt(npc, defensiveFilter);
          return;
        case "protective":
          hunt(npc, protectiveFilter);
          return;
      }
    }

    function runPatrol(npc: Entity) {
      if (!npc.has(Patrol) || npc.has(Path)) return;
      const path = npc.get(Patrol).path;
      if (path.length === 0) return;
      const state = patrolState.get(npc.id) ?? { reversed: false };
      const next = state.reversed ? [...path].reverse() : [...path];
      patrolState.set(npc.id, { reversed: !state.reversed });
      npc.set(
        Path,
        next.map((v) => new Vector(v.x, v.y)),
      );
    }

    function hunt(
      npc: Entity,
      filter: (npc: Entity, candidate: Entity) => boolean,
    ) {
      if (npc.has(AttackTarget)) {
        maintainAttackTarget(npc);
        return;
      }
      const best = findHuntTarget(npc, filter);
      if (best) {
        combat.attack(npc, best);
        if (npc.has(MovementSpeed)) npc.set(MovementSpeed, { speed: 2 });
      }
    }

    function maintainAttackTarget(npc: Entity) {
      const meta = npc.get(NpcMeta);
      const npcPos = npc.get(Position);
      const targetId = npc.get(AttackTarget).entityId;
      const target = ctx.rift.entity(targetId);
      const lost =
        !target ||
        !target.has(Position) ||
        !npcPos.isWithinDistance(target.get(Position), meta.aggroRange) ||
        (target.has(Health) && target.get(Health).current <= 0);
      if (!lost) return;
      npc.remove(AttackTarget);
      if (npc.has(Path)) npc.remove(Path);
      if (npc.has(MovementSpeed)) npc.set(MovementSpeed, { speed: 1 });
      movement.cancelMove(npc);
    }

    function findHuntTarget(
      npc: Entity,
      filter: (npc: Entity, candidate: Entity) => boolean,
    ): Entity | undefined {
      const meta = npc.get(NpcMeta);
      const npcPos = npc.get(Position);
      const npcAreaId = npc.has(AreaMember)
        ? npc.get(AreaMember).areaId
        : undefined;
      let best: Entity | undefined;
      let bestDistSq = Infinity;
      for (const candidate of ctx.rift.query(PlayerControlled, Position)
        .value) {
        if (!isHuntable(candidate, npcAreaId)) continue;
        const candPos = candidate.get(Position);
        if (!npcPos.isWithinDistance(candPos, meta.aggroRange)) continue;
        if (!filter(npc, candidate)) continue;
        const dx = candPos.x - npcPos.x;
        const dy = candPos.y - npcPos.y;
        const d = dx * dx + dy * dy;
        if (d < bestDistSq) {
          bestDistSq = d;
          best = candidate;
        }
      }
      return best;
    }

    function isHuntable(
      candidate: Entity,
      npcAreaId: AreaId | undefined,
    ): boolean {
      if (candidate.has(Health) && candidate.get(Health).current <= 0)
        return false;
      if (
        npcAreaId !== undefined &&
        candidate.has(AreaMember) &&
        candidate.get(AreaMember).areaId !== npcAreaId
      )
        return false;
      return true;
    }

    function aggressiveFilter(): boolean {
      return true;
    }

    function defensiveFilter(npc: Entity, candidate: Entity): boolean {
      return memory.get(npc.id)?.has(candidate.id) ?? false;
    }

    function protectiveFilter(npc: Entity, candidate: Entity): boolean {
      const npcSpawn = npc.has(NpcMeta) ? npc.get(NpcMeta).spawnId : undefined;
      if (!npcSpawn) return false;
      for (const ally of ctx.rift.query(NpcActor, NpcMeta).value) {
        if (ally.get(NpcMeta).spawnId !== npcSpawn) continue;
        if (memory.get(ally.id)?.has(candidate.id)) return true;
      }
      return false;
    }

    return { api: { rememberedCombats: memory } };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
