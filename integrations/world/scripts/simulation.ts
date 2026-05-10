// oxlint-disable no-console
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Vector } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { Rng } from "@mp/std";
import type { UserId } from "@mp/auth";
import { Opcode, type ClientId } from "@rift/core";
import { MpRiftServer } from "../src/server";
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
import { schemaComponents, schemaEvents } from "../src/schema";
import { fnv1a64 } from "../src/hash";
import {
  SessionRegistry,
  sessionRegistryFeature,
} from "../src/identity/session-registry";
import { OwnedByClient } from "../src/identity/components";
import { combatFeature } from "../src/combat/feature";
import { movementFeature } from "../src/movement/feature";
import { npcAiFeature } from "../src/npc/ai-feature";
import { npcRewardFeature } from "../src/npc/reward-feature";
import { npcSpawnerFeature } from "../src/npc/spawner-feature";
import { visibilityFeature } from "../src/visibility/feature";
import { spawnCharacter } from "../src/character/bundle";
import { createItemDefinitionLookup } from "../src/item/definition-lookup";
import { loadAreaResource } from "../src/area/load";
import type { AreaResource } from "../src/area/area-resource";
import type { AreaId } from "@mp/fixtures";
import type { CharacterId } from "../src/character/id";
import type { InventoryId } from "../src/inventory/components";

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
  readonly server: MpRiftServer;
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
  readonly tickHz?: number;
  readonly warmupTicks?: number;
  readonly connectFakeClient?: boolean;
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
  const registry = new SessionRegistry();
  const itemLookup = createItemDefinitionLookup(consumables, equipment);
  const rng = new Rng();

  const server = new MpRiftServer({
    transport,
    hash: fnv1a64,
    tickRateHz: 0,
    features: [
      { components: schemaComponents, events: schemaEvents },
      sessionRegistryFeature(registry),
      movementFeature({ areas: areaMap }),
      combatFeature(),
      visibilityFeature({ viewDistance, areas: areaMap, registry }),
      npcSpawnerFeature({
        areas: areaMap,
        npcs,
        spawns,
        actorModels: actorModelsById,
        rng,
      }),
      npcAiFeature({ areas: areaMap, rng }),
      npcRewardFeature({
        rewardsByNpcId: npcRewardsByNpcId,
        itemLookup,
      }),
    ],
  });

  await server.start();

  const dt = 1 / tickHz;
  const fakeClientId = 1 as ClientId;
  const fakeUserId = "user-1" as UserId;
  registry.recordConnection(fakeClientId, {
    name: "bench",
    id: fakeUserId,
    roles: new Set(),
  });
  const characterStart = new Vector(
    Math.floor(area.tiled.tileCount.x / 2) as Tile,
    Math.floor(area.tiled.tileCount.y / 2) as Tile,
  );
  const characterEnt = spawnCharacter(server.world, {
    characterId: "char-1" as CharacterId,
    userId: fakeUserId,
    name: "Bencher",
    modelId: actorModels[0].id,
    areaId,
    coords: characterStart,
    inventoryId: "inv-1" as InventoryId,
    speed: 1 as Tile,
    health: Number.MAX_SAFE_INTEGER,
    maxHealth: Number.MAX_SAFE_INTEGER,
    attackDamage: 5,
    attackSpeed: 1 as TimesPerSecond,
    attackRange: 1 as Tile,
    xp: 0,
    actorModels: actorModelsById,
  });
  server.world.add(characterEnt, OwnedByClient, { clientId: fakeClientId });

  for (let i = 0; i < warmupTicks; i++) {
    server.tick(dt);
  }

  if (connectFakeClient) {
    transport.bytes.length = 0;
    transport.packets.length = 0;
    transport.emit({ type: "open", clientId: fakeClientId });
    const helloWriter = new Writer(64);
    helloWriter.writeU8(Opcode.Hello);
    helloWriter.writeBytes(server.schema.digest());
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

export const SIMULATION_SECONDS = 10;
export const NPC_COUNT_SCENARIOS: readonly number[] = [25, 100, 200];
