import type { Tile, TimesPerSecond } from "@mp/std";
import type { ActorModelId, NpcDefinition, NpcDefinitionId } from "@mp/world";

const oneTile = 1 as Tile;

export const npcs: ReadonlyArray<NpcDefinition> = [
  {
    id: "1" as NpcDefinitionId,
    name: "Soldier",
    speed: oneTile,
    maxHealth: 25,
    attackDamage: 3,
    attackSpeed: 1 as TimesPerSecond,
    attackRange: oneTile,
    aggroRange: 7 as Tile,
    npcType: "protective",
    modelId: "adventurer" as ActorModelId,
  },
];

export const npcsById: ReadonlyMap<NpcDefinitionId, NpcDefinition> = new Map(
  npcs.map((n) => [n.id, n]),
);
