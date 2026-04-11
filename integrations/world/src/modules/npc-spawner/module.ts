import type { Entity, EntityId, Infer } from "@rift/core";
import { defineModule } from "@rift/modular";
import { Vector } from "@mp/math";
import { createShortId } from "@mp/std";
import {
  Alive,
  Appearance,
  AreaMember,
  AttackStats,
  Health,
  MovementSpeed,
  NpcActor,
  NpcMeta,
  Patrol,
  Position,
} from "../../components";
import type {
  AreaId,
  NpcDefinitionId,
  NpcInstanceId,
  NpcSpawnId,
  NpcType,
} from "../../domain-ids";
import { AreaModule } from "../area/module";

export interface NpcTemplate {
  definitionId: NpcDefinitionId;
  npcType: NpcType;
  aggroRange: number;
  movementSpeed: number;
  maxHealth: number;
  attackStats: Infer<typeof AttackStats>;
  appearance: Infer<typeof Appearance>;
}

export interface NpcSpawnDef {
  spawnId: NpcSpawnId;
  areaId: AreaId;
  count: number;
  position: Vector<number>;
  patrol?: ReadonlyArray<Vector<number>>;
  template: NpcTemplate;
}

export interface NpcSpawnerApi {
  registerSpawn(def: NpcSpawnDef): void;
  unregisterSpawn(spawnId: NpcSpawnId): void;
  listSpawns(): ReadonlyArray<NpcSpawnDef>;
  spawnOne(spawnId: NpcSpawnId): Entity | undefined;
}

const corpseDurationSec = 5;

export const NpcSpawnerModule = defineModule({
  dependencies: [AreaModule] as const,
  server: (ctx): { api: NpcSpawnerApi } => {
    const spawns = new Map<NpcSpawnId, NpcSpawnDef>();
    const corpseTimers = new Map<EntityId, number>();
    let elapsedSec = 0;

    const registerSpawn: NpcSpawnerApi["registerSpawn"] = (def) => {
      spawns.set(def.spawnId, def);
    };

    const unregisterSpawn: NpcSpawnerApi["unregisterSpawn"] = (spawnId) => {
      spawns.delete(spawnId);
    };

    const listSpawns: NpcSpawnerApi["listSpawns"] = () => [...spawns.values()];

    const spawnOne: NpcSpawnerApi["spawnOne"] = (spawnId) => {
      const def = spawns.get(spawnId);
      if (!def) return undefined;
      return spawnNpc(def);
    };

    function spawnNpc(def: NpcSpawnDef): Entity {
      const entity = ctx.rift.spawn();
      const instanceId = createShortId<NpcInstanceId>();
      entity.set(NpcActor);
      entity.set(NpcMeta, {
        instanceId,
        definitionId: def.template.definitionId,
        spawnId: def.spawnId,
        npcType: def.template.npcType,
        aggroRange: def.template.aggroRange,
      });
      entity.set(Position, new Vector(def.position.x, def.position.y));
      entity.set(AreaMember, { areaId: def.areaId });
      entity.set(Health, {
        current: def.template.maxHealth,
        max: def.template.maxHealth,
      });
      entity.set(Alive);
      entity.set(AttackStats, def.template.attackStats);
      entity.set(MovementSpeed, { speed: def.template.movementSpeed });
      entity.set(Appearance, def.template.appearance);
      if (def.patrol && def.patrol.length > 0) {
        entity.set(Patrol, {
          path: def.patrol.map((p) => new Vector(p.x, p.y)),
        });
      }
      return entity;
    }

    ctx.onTick((dt) => {
      elapsedSec += dt;
      cleanupCorpses();
      respawnMissing();
    });

    function cleanupCorpses() {
      for (const npc of ctx.rift.query(NpcActor, Health).value) {
        if (npc.get(Health).current > 0) {
          corpseTimers.delete(npc.id);
          continue;
        }
        const deadline = corpseTimers.get(npc.id);
        if (deadline === undefined) {
          corpseTimers.set(npc.id, elapsedSec + corpseDurationSec);
          continue;
        }
        if (elapsedSec >= deadline) {
          corpseTimers.delete(npc.id);
          ctx.rift.destroy(npc);
        }
      }
    }

    function respawnMissing() {
      const aliveBySpawn = new Map<NpcSpawnId, number>();
      for (const npc of ctx.rift.query(NpcActor, NpcMeta, Health).value) {
        if (npc.get(Health).current <= 0) continue;
        const spawnId = npc.get(NpcMeta).spawnId;
        aliveBySpawn.set(spawnId, (aliveBySpawn.get(spawnId) ?? 0) + 1);
      }
      for (const def of spawns.values()) {
        const alive = aliveBySpawn.get(def.spawnId) ?? 0;
        const missing = def.count - alive;
        for (let i = 0; i < missing; i++) spawnNpc(def);
      }
    }

    return {
      api: { registerSpawn, unregisterSpawn, listSpawns, spawnOne },
    };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
