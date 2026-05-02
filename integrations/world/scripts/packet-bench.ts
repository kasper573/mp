// oxlint-disable no-console
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { Rng } from "@mp/std";
import { loadAreaResource } from "../src/area/load";
import { DeltaOp, Opcode, RiftServer, type ClientId } from "@rift/core";
import { Reader, Writer } from "@rift/types";
import {
  actorModels,
  actorModelsById,
  areas as areaFixtures,
  consumables,
  equipment,
  npcRewardsByNpcId,
  npcs,
  npcSpawns,
  viewDistance,
} from "@mp/fixtures";
import { schema } from "../src/schema";
import { ClientCharacterRegistry } from "../src/identity/client-character-registry";
import { MovementModule } from "../src/movement/module";
import { CombatModule } from "../src/combat/module";
import { VisibilityModule } from "../src/visibility/module";
import { NpcSpawnerModule } from "../src/npc/spawner-module";
import { NpcAiModule } from "../src/npc/ai-module";
import { NpcRewardModule } from "../src/npc/reward-module";
import { spawnCharacter } from "../src/character/bundle";
import { Movement } from "../src/movement/components";
import { CharacterTag, NpcTag } from "../src/identity/components";
import { AreaTag } from "../src/area/components";
import { Combat } from "../src/combat/components";
import { Appearance } from "../src/appearance/components";
import { NpcAi } from "../src/npc/components";
import { InventoryRef, OwnedBy } from "../src/inventory/components";
import { Progression } from "../src/progression/components";
import { ConsumableInstance, EquipmentInstance } from "../src/item/components";
import { createItemDefinitionLookup } from "../src/item/definition-lookup";
import type { ServerTransport, ServerTransportEvent } from "@rift/core";
import type { AreaResource } from "../src/area/area-resource";
import type { AreaId, CharacterId, InventoryId } from "../src/identity/ids";

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docker/file-server/public/areas",
);

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

interface CapturingTransport extends ServerTransport {
  emit(ev: ServerTransportEvent): void;
  bytes: number[];
  packets: Uint8Array[];
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

interface OpStat {
  count: number;
  bytes: number;
}

interface SignalDecodable {
  readonly decode: (r: Reader) => unknown;
  readonly signal: (v: unknown) => {
    decode: (r: Reader) => void;
    decodeDirty: (r: Reader) => void;
  };
  readonly default: () => unknown;
}

function analyzeDelta(
  data: Uint8Array,
  components: ReadonlyArray<SignalDecodable>,
  signals: Array<{
    decode: (r: Reader) => void;
    decodeDirty: (r: Reader) => void;
  }>,
  byComp: Map<number, OpStat>,
  byOp: Map<DeltaOp, OpStat>,
): void {
  if ((data[0] as Opcode) !== Opcode.Delta) return;
  const r = new Reader(data, 1);
  r.readVarU32();
  r.readVarU32();
  const opCount = r.readVarU32();
  for (let i = 0; i < opCount; i++) {
    const opStart = r.offset;
    const op = r.readU8() as DeltaOp;
    let compIdx: number | undefined;
    switch (op) {
      case DeltaOp.EntityCreated:
      case DeltaOp.EntityDestroyed:
        r.readVarU32();
        break;
      case DeltaOp.ComponentRemoved:
        r.readVarU32();
        compIdx = r.readVarU32();
        break;
      case DeltaOp.ComponentAdded: {
        r.readVarU32();
        compIdx = r.readVarU32();
        components[compIdx].decode(r);
        break;
      }
      case DeltaOp.ComponentUpdated: {
        r.readVarU32();
        compIdx = r.readVarU32();
        signals[compIdx].decodeDirty(r);
        break;
      }
    }
    const opBytes = r.offset - opStart;
    const opStat = byOp.get(op) ?? { count: 0, bytes: 0 };
    opStat.count++;
    opStat.bytes += opBytes;
    byOp.set(op, opStat);
    if (compIdx !== undefined) {
      const cs = byComp.get(compIdx) ?? { count: 0, bytes: 0 };
      cs.count++;
      cs.bytes += opBytes;
      byComp.set(compIdx, cs);
    }
  }
}

async function main(): Promise<void> {
  const areaId = areaFixtures[0].id;
  const area = await loadBenchArea(areaId);
  const areaMap = new Map<AreaId, AreaResource>([[areaId, area]]);
  console.log(
    `[area] ${areaId} ${area.tiled.tileCount.x}x${area.tiled.tileCount.y} tiles, start ${area.start.x},${area.start.y}, ${area.graph.nodeIds.size} walkable nodes`,
  );

  const transport = makeTransport();
  const registry = new ClientCharacterRegistry();
  const itemLookup = createItemDefinitionLookup(consumables, equipment);
  const rng = new Rng();

  const server = new RiftServer({
    schema: schema,
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
        spawns: npcSpawns,
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

  const tickHz = 20;
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

  for (let i = 0; i < 60; i++) {
    server.tick(dt);
  }

  transport.bytes.length = 0;
  transport.emit({ type: "open", clientId: fakeClientId });
  const helloWriter = new Writer(64);
  helloWriter.writeU8(Opcode.Hello);
  helloWriter.writeBytes(schema.digest());
  transport.emit({
    type: "message",
    clientId: fakeClientId,
    data: helloWriter.finish(),
  });

  const handshakeBytes = [...transport.bytes];
  const handshakeSum = handshakeBytes.reduce((a, b) => a + b, 0);
  console.log(
    `[handshake] sent ${handshakeBytes.length} packets, ${handshakeSum} bytes (snapshot)`,
  );

  const sizesBefore = transport.bytes.length;

  const seconds = 10;
  const totalTicks = tickHz * seconds;

  const tileCount = area.tiled.tileCount;
  const cx = Math.floor(tileCount.x / 2) as Tile;
  const cy = Math.floor(tileCount.y / 2) as Tile;
  const waypoints: Array<Vector<Tile>> = [
    new Vector((cx - 6) as Tile, (cy - 6) as Tile),
    new Vector((cx + 6) as Tile, (cy - 6) as Tile),
    new Vector((cx + 6) as Tile, (cy + 6) as Tile),
    new Vector((cx - 6) as Tile, (cy + 6) as Tile),
  ];
  void waypoints;
  for (let i = 0; i < totalTicks; i++) {
    server.tick(dt);
  }

  const tickSizes = transport.bytes.slice(sizesBefore);
  const tickBytes = tickSizes.reduce((a, b) => a + b, 0);
  const avg =
    tickSizes.length > 0 ? Math.round(tickBytes / tickSizes.length) : 0;
  const max = tickSizes.reduce((a, b) => Math.max(a, b), 0);
  const min = tickSizes.reduce((a, b) => Math.min(a, b), tickSizes[0] ?? 0);

  console.log(`[ticks] ${totalTicks} ticks @ ${tickHz}Hz`);
  console.log(`[ticks] sent ${tickSizes.length} delta packets`);
  console.log(`[ticks] total ${tickBytes} bytes`);
  console.log(`[ticks] avg/packet ${avg}B  min ${min}B  max ${max}B`);
  console.log(`[ticks] avg/sec ${Math.round(tickBytes / seconds)}B`);

  const byComp = new Map<number, OpStat>();
  const byOp = new Map<DeltaOp, OpStat>();
  const signals = schema.components.map((c) =>
    (c as SignalDecodable).signal((c as SignalDecodable).default()),
  );
  for (const p of transport.packets.slice(sizesBefore)) {
    analyzeDelta(
      p,
      schema.components as ReadonlyArray<SignalDecodable>,
      signals,
      byComp,
      byOp,
    );
  }
  const opNames: Record<DeltaOp, string> = {
    [DeltaOp.EntityCreated]: "EntityCreated",
    [DeltaOp.EntityDestroyed]: "EntityDestroyed",
    [DeltaOp.ComponentAdded]: "ComponentAdded",
    [DeltaOp.ComponentRemoved]: "ComponentRemoved",
    [DeltaOp.ComponentUpdated]: "ComponentUpdated",
  };
  console.log(`[breakdown] ops:`);
  for (const [op, s] of [...byOp.entries()].sort(
    (a, b) => b[1].bytes - a[1].bytes,
  )) {
    console.log(
      `  ${opNames[op].padEnd(18)} count=${String(s.count).padStart(5)}  bytes=${String(s.bytes).padStart(7)}  avg=${Math.round(s.bytes / s.count)}B`,
    );
  }
  console.log(`[breakdown] components:`);
  for (const [idx, s] of [...byComp.entries()].sort(
    (a, b) => b[1].bytes - a[1].bytes,
  )) {
    const name = componentName(idx);
    console.log(
      `  ${name.padEnd(20)} count=${String(s.count).padStart(5)}  bytes=${String(s.bytes).padStart(7)}  avg=${Math.round(s.bytes / s.count)}B`,
    );
  }

  await server.stop();
}

const componentLabels = new Map<unknown, string>([
  [CharacterTag, "CharacterTag"],
  [NpcTag, "NpcTag"],
  [AreaTag, "AreaTag"],
  [Movement, "Movement"],
  [Combat, "Combat"],
  [Appearance, "Appearance"],
  [NpcAi, "NpcAi"],
  [InventoryRef, "InventoryRef"],
  [OwnedBy, "OwnedBy"],
  [Progression, "Progression"],
  [ConsumableInstance, "ConsumableInstance"],
  [EquipmentInstance, "EquipmentInstance"],
]);

function componentName(idx: number): string {
  return componentLabels.get(schema.components[idx]) ?? `comp[${idx}]`;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
