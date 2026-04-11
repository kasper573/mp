import { type } from "@mp/validate";

export { type UserId } from "@mp/auth";
export type { ObjectId } from "@mp/tiled-loader";

export const CharacterIdType = type("string").brand("CharacterId");
export type CharacterId = typeof CharacterIdType.infer;

export const NpcInstanceIdType = type("string").brand("NpcInstanceId");
export type NpcInstanceId = typeof NpcInstanceIdType.infer;

export const NpcDefinitionIdType = type("string").brand("NpcDefinitionId");
export type NpcDefinitionId = typeof NpcDefinitionIdType.infer;

export const NpcSpawnIdType = type("string").brand("NpcSpawnId");
export type NpcSpawnId = typeof NpcSpawnIdType.infer;

export const InventoryIdType = type("string").brand("InventoryId");
export type InventoryId = typeof InventoryIdType.infer;

export const AreaIdType = type("string").brand("AreaId");
export type AreaId = typeof AreaIdType.infer;

export const ActorModelIdType = type("string").brand("ActorModelId");
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
