import { type } from "@mp/validate";

export type CharacterId = typeof CharacterIdType.infer;
export const CharacterIdType = type("string").brand("CharacterId");

export type NpcDefinitionId = typeof NpcDefinitionIdType.infer;
export const NpcDefinitionIdType = type("string").brand("NpcDefinitionId");

export type NpcSpawnId = typeof NpcSpawnIdType.infer;
export const NpcSpawnIdType = type("string").brand("NpcSpawnId");

export type NpcRewardId = typeof NpcRewardIdType.infer;
export const NpcRewardIdType = type("string").brand("NpcRewardId");

export type ActorModelId = typeof ActorModelIdType.infer;
export const ActorModelIdType = type("string").brand("ActorModelId");

export type AreaId = typeof AreaIdType.infer;
export const AreaIdType = type("string").brand("AreaId");

export type InventoryId = typeof InventoryIdType.infer;
export const InventoryIdType = type("string").brand("InventoryId");

export type ConsumableDefinitionId = typeof ConsumableDefinitionIdType.infer;
export const ConsumableDefinitionIdType = type("string").brand(
  "ConsumableDefinitionId",
);

export type ConsumableInstanceId = typeof ConsumableInstanceIdType.infer;
export const ConsumableInstanceIdType = type("string").brand(
  "ConsumableInstanceId",
);

export type EquipmentDefinitionId = typeof EquipmentDefinitionIdType.infer;
export const EquipmentDefinitionIdType = type("string").brand(
  "EquipmentDefinitionId",
);

export type EquipmentInstanceId = typeof EquipmentInstanceIdType.infer;
export const EquipmentInstanceIdType = type("string").brand(
  "EquipmentInstanceId",
);
