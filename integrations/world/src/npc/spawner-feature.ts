import type { Cleanup, Feature } from "@rift/feature";
import { type EntityId, Tick, type World } from "@rift/core";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { combine, createShortId, Rng } from "@mp/std";
import type { ActorModelLookup } from "../appearance/actor-model";
import type { AreaResource } from "../area/area-resource";
import type { AreaId, NpcSpawnId } from "../identity/ids";
import { NpcTag } from "../identity/components";
import { Combat } from "../combat/components";
import { spawnNpc } from "./bundle";
import type { NpcDefinition, NpcSpawn } from "./definitions";

const RESPAWN_DELAY_MS = 5_000;

export interface NpcSpawnerOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly npcs: ReadonlyArray<NpcDefinition>;
  readonly spawns: ReadonlyArray<NpcSpawn>;
  readonly actorModels: ActorModelLookup;
  readonly rng?: Rng;
}

interface SpawnerCtx {
  readonly world: World;
  readonly opts: NpcSpawnerOptions;
  readonly npcsById: ReadonlyMap<string, NpcDefinition>;
  readonly rng: Rng;
}

export function npcSpawnerFeature(opts: NpcSpawnerOptions): Feature {
  const npcsById = new Map(opts.npcs.map((n) => [n.id, n]));
  const rng = opts.rng ?? new Rng();
  return {
    server(server): Cleanup {
      const ctx: SpawnerCtx = {
        world: server.world,
        opts,
        npcsById,
        rng,
      };
      const pendingRespawns = new Map<
        EntityId,
        { spawnId: NpcSpawnId; respawnAtMs: number }
      >();
      let elapsedMs = 0;
      let initialized = false;

      return combine(
        server.on(Tick, (event) => {
          elapsedMs += event.data.dt * 1000;

          if (!initialized) {
            spawnInitial(ctx);
            initialized = true;
          }

          for (const [id, , combat] of server.world.query(NpcTag, Combat)) {
            if (!combat.alive && !pendingRespawns.has(id)) {
              const tag = server.world.get(id, NpcTag);
              if (!tag) continue;
              pendingRespawns.set(id, {
                spawnId: tag.spawnId,
                respawnAtMs: elapsedMs + RESPAWN_DELAY_MS,
              });
            }
          }

          for (const [entId, info] of pendingRespawns) {
            if (elapsedMs < info.respawnAtMs) continue;
            respawn(ctx, entId, info.spawnId);
            pendingRespawns.delete(entId);
          }
        }),
        () => {
          pendingRespawns.clear();
        },
      );
    },
  };
}

function spawnInitial(ctx: SpawnerCtx): void {
  for (const spawn of ctx.opts.spawns) {
    const def = ctx.npcsById.get(spawn.npcId);
    const area = ctx.opts.areas.get(spawn.areaId);
    if (!def || !area) continue;
    for (let i = 0; i < spawn.count; i++) {
      spawnNpc(ctx.world, {
        definition: def,
        spawn,
        coords: pickSpawnCoord(spawn, area, ctx.rng),
        actorModels: ctx.opts.actorModels,
      });
    }
  }
}

function respawn(ctx: SpawnerCtx, entId: EntityId, spawnId: NpcSpawnId): void {
  ctx.world.destroy(entId);
  const spawn = ctx.opts.spawns.find((s) => s.id === spawnId);
  if (!spawn) return;
  const def = ctx.npcsById.get(spawn.npcId);
  const area = ctx.opts.areas.get(spawn.areaId);
  if (!def || !area) return;
  for (let i = 0; i < spawn.count; i++) {
    spawnNpc(ctx.world, {
      definition: def,
      spawn: { ...spawn, id: createShortId() },
      coords: pickSpawnCoord(spawn, area, ctx.rng),
      actorModels: ctx.opts.actorModels,
    });
  }
}

function pickSpawnCoord(
  spawn: NpcSpawn,
  area: AreaResource,
  rng: Rng,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }
  const ids = Array.from(area.graph.nodeIds);
  if (ids.length === 0) {
    return area.start;
  }
  return area.graph.getNode(rng.oneOf(ids))?.data.vector ?? area.start;
}
