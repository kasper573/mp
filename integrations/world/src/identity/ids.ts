import type { Branded } from "@mp/std";

export type CharacterId = Branded<string, "CharacterId">;

export type InventoryId = Branded<string, "InventoryId">;

export type ConsumableInstanceId = Branded<string, "ConsumableInstanceId">;

export type EquipmentInstanceId = Branded<string, "EquipmentInstanceId">;

export type {
  ActorModelId,
  AreaId,
  ConsumableDefinitionId,
  EquipmentDefinitionId,
  NpcDefinitionId,
  NpcRewardId,
  NpcSpawnId,
} from "@mp/fixtures";

export {
  ActorModelIdType,
  AreaIdType,
  ConsumableDefinitionIdType,
  EquipmentDefinitionIdType,
  NpcDefinitionIdType,
  NpcRewardIdType,
  NpcSpawnIdType,
} from "@mp/fixtures";
