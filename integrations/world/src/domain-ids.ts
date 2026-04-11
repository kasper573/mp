import { type } from "@mp/validate";

export { type UserId } from "@mp/auth";
export type { ObjectId } from "@mp/tiled-loader";

export const CharacterIdType = type("string").brand("CharacterId");
/** @gqlScalar */
export type CharacterId = typeof CharacterIdType.infer;

export const NpcInstanceIdType = type("string").brand("NpcInstanceId");
export type NpcInstanceId = typeof NpcInstanceIdType.infer;

export const NpcDefinitionIdType = type("string").brand("NpcDefinitionId");
export type NpcDefinitionId = typeof NpcDefinitionIdType.infer;

export const NpcSpawnIdType = type("string").brand("NpcSpawnId");
export type NpcSpawnId = typeof NpcSpawnIdType.infer;

export const InventoryIdType = type("string").brand("InventoryId");
export type InventoryId = typeof InventoryIdType.infer;

export const ConsumableInstanceIdType = type("string").brand(
  "ConsumableInstanceId",
);
export type ConsumableInstanceId = typeof ConsumableInstanceIdType.infer;

export const EquipmentInstanceIdType = type("string").brand(
  "EquipmentInstanceId",
);
export type EquipmentInstanceId = typeof EquipmentInstanceIdType.infer;

export const ConsumableDefinitionIdType = type("string").brand(
  "ConsumableDefinitionId",
);
export type ConsumableDefinitionId = typeof ConsumableDefinitionIdType.infer;

export const EquipmentDefinitionIdType = type("string").brand(
  "EquipmentDefinitionId",
);
export type EquipmentDefinitionId = typeof EquipmentDefinitionIdType.infer;

export type ItemInstanceId = ConsumableInstanceId | EquipmentInstanceId;
export type ItemDefinitionId = ConsumableDefinitionId | EquipmentDefinitionId;
export type ItemType = "consumable" | "equipment";

export const ActorIdType = NpcInstanceIdType.or(CharacterIdType);
/** @gqlScalar */
export type ActorId = typeof ActorIdType.infer;

export const AreaIdType = type("string").brand("AreaId");
/** @gqlScalar */
export type AreaId = typeof AreaIdType.infer;

export const ActorModelIdType = type("string").brand("ActorModelId");
/** @gqlScalar */
export type ActorModelId = typeof ActorModelIdType.infer;

export type CardinalDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export const npcTypes = [
  "static",
  "patrol",
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
] as const;
export type NpcType = (typeof npcTypes)[number];
