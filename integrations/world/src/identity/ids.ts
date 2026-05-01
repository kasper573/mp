import { type } from "@mp/validate";

export type CharacterId = typeof CharacterIdType.infer;
export const CharacterIdType = type("string").brand("CharacterId");

export type InventoryId = typeof InventoryIdType.infer;
export const InventoryIdType = type("string").brand("InventoryId");

export type ConsumableInstanceId = typeof ConsumableInstanceIdType.infer;
export const ConsumableInstanceIdType = type("string").brand(
  "ConsumableInstanceId",
);

export type EquipmentInstanceId = typeof EquipmentInstanceIdType.infer;
export const EquipmentInstanceIdType = type("string").brand(
  "EquipmentInstanceId",
);

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
