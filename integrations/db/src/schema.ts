// Export all entities
export {
  ActorModel,
  Area,
  Character,
  ConsumableDefinition,
  ConsumableInstance,
  EquipmentDefinition,
  EquipmentInstance,
  Inventory,
  Npc,
  NpcReward,
  NpcSpawn,
} from "./entities";

// For backward compatibility, export table references
import {
  ActorModel,
  Area,
  Character,
  ConsumableDefinition,
  ConsumableInstance,
  EquipmentDefinition,
  EquipmentInstance,
  Inventory,
  Npc,
  NpcReward,
  NpcSpawn,
} from "./entities";

export const actorModelTable = ActorModel;
export const areaTable = Area;
export const characterTable = Character;
export const consumableDefinitionTable = ConsumableDefinition;
export const consumableInstanceTable = ConsumableInstance;
export const equipmentDefinitionTable = EquipmentDefinition;
export const equipmentInstanceTable = EquipmentInstance;
export const inventoryTable = Inventory;
export const npcTable = Npc;
export const npcRewardTable = NpcReward;
export const npcSpawnTable = NpcSpawn;
