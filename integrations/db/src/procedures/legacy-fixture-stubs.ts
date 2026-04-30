import * as fixtures from "@mp/fixtures";
import type {
  AreaId,
  ConsumableDefinitionId,
  EquipmentDefinitionId,
  ItemDefinition,
  NpcDefinition,
  NpcReward,
  NpcSpawn,
} from "@mp/world";
import { procedure } from "../utils/procedure";

export const selectAllActorModelIds = procedure().query(() =>
  fixtures.actorModels.map((m) => m.id),
);

export const selectAllItemDefinitions = procedure().query(
  () => fixtures.items as ItemDefinition[],
);

export const selectConsumableDefinition = procedure()
  .input<ConsumableDefinitionId>()
  .query((_drizzle, id) => {
    const def = fixtures.consumablesById.get(id);
    if (!def) {
      throw new Error(`unknown consumable: ${String(id)}`);
    }
    return def;
  });

export const selectEquipmentDefinition = procedure()
  .input<EquipmentDefinitionId>()
  .query((_drizzle, id) => {
    const def = fixtures.equipmentById.get(id);
    if (!def) {
      throw new Error(`unknown equipment: ${String(id)}`);
    }
    return def;
  });

export const selectAllNpcRewards = procedure()
  .input<AreaId>()
  .query(() => fixtures.npcRewards as NpcReward[]);

export const selectAllSpawnAndNpcPairs = procedure()
  .input<AreaId>()
  .query((_drizzle, areaId) => {
    const result: Array<{ spawn: NpcSpawn; npc: NpcDefinition }> = [];
    for (const spawn of fixtures.npcSpawns) {
      if (spawn.areaId !== areaId) continue;
      const npc = fixtures.npcsById.get(spawn.npcId);
      if (!npc) continue;
      result.push({ spawn, npc });
    }
    return result;
  });
