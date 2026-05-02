// oxlint-disable no-console
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { Rng } from "@mp/std";
import { Opcode, RiftServer, type ClientId } from "@rift/core";
import { Writer } from "@rift/types";
import {
  actorModels,
  actorModelsById,
  areas as areaFixtures,
  consumables,
  equipment,
  npcRewardsByNpcId,
  npcs,
  type NpcDefinitionId,
  type NpcSpawn,
  type NpcSpawnId,
  type NpcType,
  viewDistance,
} from "@mp/fixtures";
import type { ServerTransport, ServerTransportEvent } from "@rift/core";
import { schema } from "../src/schema";
import { ClientCharacterRegistry } from "../src/identity/client-character-registry";
import { MovementModule } from "../src/movement/module";
import { CombatModule } from "../src/combat/module";
import { VisibilityModule } from "../src/visibility/module";
import { NpcSpawnerModule } from "../src/npc/spawner-module";
import { NpcAiModule } from "../src/npc/ai-module";
import { NpcRewardModule } from "../src/npc/reward-module";
import { spawnCharacter } from "../src/character/bundle";
import { createItemDefinitionLookup } from "../src/item/definition-lookup";
import { loadAreaResource } from "../src/area/load";
import type { AreaResource } from "../src/area/area-resource";
import type { AreaId, CharacterId, InventoryId } from "../src/identity/ids";

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docker/file-server/public/areas",
);

export interface CapturingTransport extends ServerTransport {
  emit(ev: ServerTransportEvent): void;
  bytes: number[];
  packets: Uint8Array[];
}

export interface Simulation {
  readonly server: RiftServer;
  readonly transport: CapturingTransport;
  readonly area: AreaResource;
  readonly tickHz: number;
  readonly dt: number;
  /** Run N ticks. */
  tick(count: number): void;
  /** Tear down server. */
  stop(): Promise<void>;
}

export interface SimulationOptions {
  /** Tick rate, default 20Hz. */
  readonly tickHz?: number;
  /** Number of warmup ticks before client handshake (lets NPCs spawn). Default 60. */
  readonly warmupTicks?: number;
  /** Whether to perform a fake handshake so the server flushes deltas to a fake client. Default true. */
  readonly connectFakeClient?: boolean;
  /**
   * Total NPCs spawned per area. Distributed across npc types in the same
   * proportions as the @mp/fixtures default (3:3:8:3 pacifist:defensive:aggressive:protective).
   * Default 17 (= the fixture default).
   */
  readonly npcCount?: number;
}

const FIXTURE_NPC_DISTRIBUTION: Record<NpcType, number> = {
  pacifist: 3,
  defensive: 3,
  aggressive: 8,
  protective: 3,
  static: 0,
  patrol: 0,
};
const FIXTURE_NPC_TOTAL = Object.values(FIXTURE_NPC_DISTRIBUTION).reduce(
  (a, b) => a + b,
  0,
);
const SOLDIER_ID = "1" as NpcDefinitionId;

function buildNpcSpawns(
  npcCount: number,
  areaIds: readonly AreaId[],
): NpcSpawn[] {
  const scale = npcCount / FIXTURE_NPC_TOTAL;
  const wanderingTypes: NpcType[] = [
    "pacifist",
    "defensive",
    "aggressive",
    "protective",
  ];
  return areaIds.flatMap((areaId) =>
    wanderingTypes.map<NpcSpawn>((npcType) => ({
      id: `${areaId}:${npcType}` as NpcSpawnId,
      areaId,
      npcId: SOLDIER_ID,
      count: Math.max(0, Math.round(FIXTURE_NPC_DISTRIBUTION[npcType] * scale)),
      npcType,
    })),
  );
}

/**
 * Builds a sterile RiftServer with the full @mp/world module stack loaded
 * against the real forest fixture. Used as the source of truth for benchmarks
 * (packet size, cpu, memory) so each one measures the same simulation shape.
 */
export async function createSimulation(
  opts: SimulationOptions = {},
): Promise<Simulation> {
  const tickHz = opts.tickHz ?? 20;
  const warmupTicks = opts.warmupTicks ?? 60;
  const connectFakeClient = opts.connectFakeClient ?? true;
  const npcCount = opts.npcCount ?? FIXTURE_NPC_TOTAL;

  const areaId = areaFixtures[0].id;
  const area = await loadBenchArea(areaId);
  const areaMap = new Map<AreaId, AreaResource>([[areaId, area]]);
  const spawns = buildNpcSpawns(npcCount, [areaId]);

  const transport = makeTransport();
  const registry = new ClientCharacterRegistry();
  const itemLookup = createItemDefinitionLookup(consumables, equipment);
  const rng = new Rng();

  const server = new RiftServer({
    schema,
    transport,
    tickRateHz: 0,
    modules: [
      registry,
      new MovementModule({ areas: areaMap }),
      new CombatModule(),
      new VisibilityModule({ viewDistance, areas: areaMap }),
      new NpcSpawnerModule({
        areas: areaMap,
        npcs,
        spawns,
        actorModels: actorModelsById,
        rng,
      }),
      new NpcAiModule({ areas: areaMap, rng }),
      new NpcRewardModule({
        rewardsByNpcId: npcRewardsByNpcId,
        itemLookup,
      }),
    ],
  });

  await server.start();

  const dt = 1 / tickHz;
  const fakeClientId = 1 as ClientId;
  registry.recordConnection(fakeClientId, {
    id: "user-1" as never,
    name: "bench",
    token: "" as never,
    roles: new Set(),
  });
  const characterStart = new Vector(
    Math.floor(area.tiled.tileCount.x / 2) as Tile,
    Math.floor(area.tiled.tileCount.y / 2) as Tile,
  );
  const characterEnt = spawnCharacter(server.world, {
    characterId: "char-1" as CharacterId,
    userId: "user-1" as never,
    name: "Bencher",
    modelId: actorModels[0].id,
    areaId,
    coords: characterStart,
    inventoryId: "inv-1" as InventoryId,
    speed: 1 as Tile,
    health: 100,
    maxHealth: 100,
    attackDamage: 5,
    attackSpeed: 1 as never,
    attackRange: 1 as Tile,
    xp: 0,
    actorModels: actorModelsById,
  });
  registry.setCharacterEntity(fakeClientId, characterEnt);

  for (let i = 0; i < warmupTicks; i++) {
    server.tick(dt);
  }

  if (connectFakeClient) {
    transport.bytes.length = 0;
    transport.packets.length = 0;
    transport.emit({ type: "open", clientId: fakeClientId });
    const helloWriter = new Writer(64);
    helloWriter.writeU8(Opcode.Hello);
    helloWriter.writeBytes(schema.digest());
    transport.emit({
      type: "message",
      clientId: fakeClientId,
      data: helloWriter.finish(),
    });
  }

  return {
    server,
    transport,
    area,
    tickHz,
    dt,
    tick(count: number) {
      for (let i = 0; i < count; i++) {
        server.tick(dt);
      }
    },
    async stop() {
      await server.stop();
    },
  };
}

function loadBenchArea(id: AreaId): Promise<AreaResource> {
  const baseUrl = `file://${FIXTURES_DIR}/${id}.json`;
  return loadAreaResource(id, baseUrl, {
    async fetchJson(url) {
      const path = url.startsWith("file://") ? fileURLToPath(url) : url;
      const text = await readFile(path, "utf8");
      return JSON.parse(text) as Record<string, unknown>;
    },
    resolveRelative(path, base) {
      const baseFile = base.startsWith("file://") ? fileURLToPath(base) : base;
      return `file://${resolve(dirname(baseFile), path)}`;
    },
  });
}

function makeTransport(): CapturingTransport {
  const listeners = new Set<(ev: ServerTransportEvent) => void>();
  const packets: Uint8Array[] = [];
  const bytes: number[] = [];
  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(_clientId, data) {
      packets.push(data);
      bytes.push(data.byteLength);
    },
    close() {},
    async shutdown() {},
    emit(ev) {
      for (const l of listeners) l(ev);
    },
    bytes,
    packets,
  };
}

/**
 * Default benchmark scenario: stationary player at map center,
 * NPCs from fixture spawned and aggro/wander as their AI dictates.
 * Returns the number of ticks to run for the standard 10-second simulation.
 */
export const SIMULATION_SECONDS = 10;

/** NPC counts that every benchmark sweeps over. */
export const NPC_COUNT_SCENARIOS: readonly number[] = [25, 100, 200];
