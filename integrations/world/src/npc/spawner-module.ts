import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { Tile } from "@mp/std";
import { createShortId, Rng } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId, NpcDefinitionId, NpcSpawnId } from "../identity/ids";
import { NpcTag } from "../identity/components";
import { Combat } from "../combat/components";
import { spawnNpc } from "./bundle";
import type { NpcDefinition, NpcSpawn } from "./definitions";

const RESPAWN_DELAY_MS = 5_000;

export interface NpcSpawnerOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly npcs: ReadonlyArray<NpcDefinition>;
  readonly spawns: ReadonlyArray<NpcSpawn>;
  readonly rng?: Rng;
}

export class NpcSpawnerModule extends RiftServerModule {
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #npcsById: ReadonlyMap<NpcDefinitionId, NpcDefinition>;
  readonly #spawns: ReadonlyArray<NpcSpawn>;
  readonly #rng: Rng;
  readonly #pendingRespawns = new Map<
    EntityId,
    { spawnId: NpcSpawnId; respawnAtMs: number }
  >();
  #elapsedMs = 0;
  #initialized = false;

  constructor(opts: NpcSpawnerOptions) {
    super();
    this.#areas = opts.areas;
    this.#npcsById = new Map(opts.npcs.map((n) => [n.id, n]));
    this.#spawns = opts.spawns;
    this.#rng = opts.rng ?? new Rng();
  }

  init(): Cleanup {
    const offTick = this.server.on(Tick, this.#onTick);
    return () => {
      offTick();
      this.#pendingRespawns.clear();
      this.#elapsedMs = 0;
      this.#initialized = false;
    };
  }

  #onTick = (event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    this.#elapsedMs += event.data.dt * 1000;

    if (!this.#initialized) {
      this.#spawnInitialPopulation();
      this.#initialized = true;
    }

    for (const [id, , combat] of this.server.world.query(NpcTag, Combat)) {
      if (!combat.alive && !this.#pendingRespawns.has(id)) {
        const tag = this.server.world.get(id, NpcTag);
        if (!tag) continue;
        this.#pendingRespawns.set(id, {
          spawnId: tag.spawnId,
          respawnAtMs: this.#elapsedMs + RESPAWN_DELAY_MS,
        });
      }
    }

    for (const [entId, info] of this.#pendingRespawns) {
      if (this.#elapsedMs < info.respawnAtMs) continue;
      this.#respawn(entId, info.spawnId);
      this.#pendingRespawns.delete(entId);
    }
  };

  #respawn(entId: EntityId, spawnId: NpcSpawnId): void {
    this.server.world.destroy(entId);
    const spawn = this.#spawns.find((s) => s.id === spawnId);
    if (!spawn) return;
    const def = this.#npcsById.get(spawn.npcId);
    const area = this.#areas.get(spawn.areaId);
    if (!def || !area) return;
    for (let i = 0; i < spawn.count; i++) {
      spawnNpc(this.server.world, {
        definition: def,
        spawn: { ...spawn, id: createShortId() },
        coords: this.#pickSpawnCoord(spawn, area),
      });
    }
  }

  #spawnInitialPopulation(): void {
    for (const spawn of this.#spawns) {
      const def = this.#npcsById.get(spawn.npcId);
      const area = this.#areas.get(spawn.areaId);
      if (!def || !area) continue;
      for (let i = 0; i < spawn.count; i++) {
        spawnNpc(this.server.world, {
          definition: def,
          spawn,
          coords: this.#pickSpawnCoord(spawn, area),
        });
      }
    }
  }

  #pickSpawnCoord(spawn: NpcSpawn, area: AreaResource): { x: Tile; y: Tile } {
    if (spawn.coords) {
      return { x: spawn.coords.x, y: spawn.coords.y };
    }
    const ids = Array.from(area.graph.nodeIds);
    if (ids.length === 0) {
      return { x: area.start.x, y: area.start.y };
    }
    const node = area.graph.getNode(this.#rng.oneOf(ids));
    if (!node) {
      return { x: area.start.x, y: area.start.y };
    }
    return { x: node.data.vector.x, y: node.data.vector.y };
  }
}
