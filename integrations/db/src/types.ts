import type { Branded } from "@mp/std";

// This file should only ever expose types and constants.
// This is so that it can be used in both client and server apps.
// (Drizzle runtime code cannot be used in the client, so we need this separate export for types)

export type NpcType = (typeof npcTypes)[number];
export const npcTypes = [
  /**
   * Just stands still and does nothing.
   */
  "static",
  /**
   * Patrols a path.
   */
  "patrol",
  /**
   * Will never aggro.
   */
  "pacifist",
  /**
   * Will aggro if attacked.
   */
  "defensive",
  /**
   * Will aggro if an actor considered an enemy is present.
   */
  "aggressive",
  /**
   * Will aggro if attacked or if an actor considered an ally is attacked.
   */
  "protective",
] as const;

export type ActorModelId = Branded<string, "ActorModelId">;

export type AreaId = Branded<string, "AreaId">;

export type ConsumableDefinitionId = Branded<string, "ConsumableDefinitionId">;
export type ConsumableInstanceId = Branded<string, "ConsumableInstanceId">;
export type EquipmentDefinitionId = Branded<string, "EquipmentDefinitionId">;
export type EquipmentInstanceId = Branded<string, "EquipmentInstanceId">;

export type InventoryId = Branded<string, "InventoryId">;

export type CharacterId = Branded<string, "CharacterId">;

export type NpcId = Branded<string, "NPCId">;

export type NpcSpawnId = Branded<string, "NpcSpawnId">;

export type NpcRewardId = Branded<string, "NpcRewardId">;
