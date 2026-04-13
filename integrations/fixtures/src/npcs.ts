import type { Tile, TimesPerSecond } from "@mp/std";
import type { ActorModelId, NpcDefinition, NpcDefinitionId } from "./types";

export const npcs: readonly NpcDefinition[] = [
  {
    id: "1" as NpcDefinitionId,
    name: "Soldier",
    npcType: "protective",
    speed: 1 as Tile,
    maxHealth: 25,
    attackDamage: 3,
    attackSpeed: 1 as TimesPerSecond,
    attackRange: 1 as Tile,
    aggroRange: 7 as Tile,
    modelId: "adventurer" as ActorModelId,
  },
];
