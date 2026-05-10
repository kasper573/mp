// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import { DeltaOp, Opcode } from "@rift/core";
import { Reader } from "@rift/types";
import type { RiftType } from "@rift/types";
import { schemaComponents } from "../src/schema";
import {
  CharacterClaim,
  CharacterList,
  CharacterTag,
  ClientScopeTag,
  NpcTag,
} from "../src/identity/components";
import { AreaTag } from "../src/area/components";
import { Movement } from "../src/movement/components";
import { Combat } from "../src/combat/components";
import { Appearance } from "../src/appearance/components";
import { NpcAi } from "../src/npc/components";
import { InventoryRef } from "../src/inventory/components";
import { Progression } from "../src/progression/components";
import { ConsumableInstance, EquipmentInstance } from "../src/item/components";
import {
  createSimulation,
  NPC_COUNT_SCENARIOS,
  SIMULATION_SECONDS,
} from "./simulation";

interface OpStat {
  count: number;
  bytes: number;
}

function analyzeDelta(
  data: Uint8Array,
  components: ReadonlyArray<RiftType>,
  byComp: Map<number, OpStat>,
  byOp: Map<DeltaOp, OpStat>,
): void {
  if ((data[0] as Opcode) !== Opcode.Delta) return;
  const r = new Reader(data, 1);
  r.readVarU32();
  r.readVarU32();
  while (r.remaining > 0) {
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
      case DeltaOp.ComponentAdded:
      case DeltaOp.ComponentUpdated: {
        r.readVarU32();
        compIdx = r.readVarU32();
        components[compIdx].decode(r);
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

const componentLabels = new Map<unknown, string>([
  [CharacterTag, "CharacterTag"],
  [NpcTag, "NpcTag"],
  [ClientScopeTag, "ClientScopeTag"],
  [CharacterList, "CharacterList"],
  [CharacterClaim, "CharacterClaim"],
  [AreaTag, "AreaTag"],
  [Movement, "Movement"],
  [Combat, "Combat"],
  [Appearance, "Appearance"],
  [NpcAi, "NpcAi"],
  [InventoryRef, "InventoryRef"],
  [Progression, "Progression"],
  [ConsumableInstance, "ConsumableInstance"],
  [EquipmentInstance, "EquipmentInstance"],
]);

function componentName(idx: number): string {
  return componentLabels.get(schemaComponents[idx]) ?? `comp[${idx}]`;
}

const opNames: Record<DeltaOp, string> = {
  [DeltaOp.EntityCreated]: "EntityCreated",
  [DeltaOp.EntityDestroyed]: "EntityDestroyed",
  [DeltaOp.ComponentAdded]: "ComponentAdded",
  [DeltaOp.ComponentRemoved]: "ComponentRemoved",
  [DeltaOp.ComponentUpdated]: "ComponentUpdated",
};

async function runScenario(npcCount: number): Promise<void> {
  console.log(`\n=== scenario: ${npcCount} NPCs ===`);
  const sim = await createSimulation({ npcCount });
  console.log(
    `[area] ${sim.area.id} ${sim.area.tiled.tileCount.x}x${sim.area.tiled.tileCount.y} tiles, ${sim.area.graph.nodeIds.size} walkable nodes`,
  );

  const handshakeBytes = [...sim.transport.bytes];
  const handshakeSum = handshakeBytes.reduce((a, b) => a + b, 0);
  console.log(
    `[handshake] sent ${handshakeBytes.length} packets, ${handshakeSum} bytes (snapshot)`,
  );

  const sizesBefore = sim.transport.bytes.length;
  const totalTicks = sim.tickHz * SIMULATION_SECONDS;
  sim.tick(totalTicks);

  const tickSizes = sim.transport.bytes.slice(sizesBefore);
  const tickBytes = tickSizes.reduce((a, b) => a + b, 0);
  const avg =
    tickSizes.length > 0 ? Math.round(tickBytes / tickSizes.length) : 0;
  const max = tickSizes.reduce((a, b) => Math.max(a, b), 0);
  const min = tickSizes.reduce((a, b) => Math.min(a, b), tickSizes[0] ?? 0);

  console.log(`[ticks] ${totalTicks} ticks @ ${sim.tickHz}Hz`);
  console.log(`[ticks] sent ${tickSizes.length} delta packets`);
  console.log(`[ticks] total ${tickBytes} bytes`);
  console.log(`[ticks] avg/packet ${avg}B  min ${min}B  max ${max}B`);
  console.log(`[ticks] avg/sec ${Math.round(tickBytes / SIMULATION_SECONDS)}B`);

  const byComp = new Map<number, OpStat>();
  const byOp = new Map<DeltaOp, OpStat>();
  for (const p of sim.transport.packets.slice(sizesBefore)) {
    analyzeDelta(p, schemaComponents, byComp, byOp);
  }
  console.log(`[breakdown] ops:`);
  for (const [op, s] of [...byOp.entries()].sort(
    (a, b) => b[1].bytes - a[1].bytes,
  )) {
    console.log(
      `  ${opNames[op].padEnd(18)} count=${String(s.count).padStart(6)}  bytes=${String(s.bytes).padStart(8)}  avg=${Math.round(s.bytes / s.count)}B`,
    );
  }
  console.log(`[breakdown] components:`);
  for (const [idx, s] of [...byComp.entries()].sort(
    (a, b) => b[1].bytes - a[1].bytes,
  )) {
    const name = componentName(idx);
    console.log(
      `  ${name.padEnd(20)} count=${String(s.count).padStart(6)}  bytes=${String(s.bytes).padStart(8)}  avg=${Math.round(s.bytes / s.count)}B`,
    );
  }

  await sim.stop();
}

async function main(): Promise<void> {
  for (const npcCount of NPC_COUNT_SCENARIOS) {
    await runScenario(npcCount);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
