import type { Tile, TimesPerSecond } from "@mp/std";
import type { ActorModelId, NpcDefinitionId } from "./ids";

export const npcTypes = [
  "static",
  "patrol",
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
] as const;

export type NpcType = (typeof npcTypes)[number];

export interface NpcDefinition {
  readonly id: NpcDefinitionId;
  readonly speed: Tile;
  readonly maxHealth: number;
  readonly attackDamage: number;
  readonly attackSpeed: TimesPerSecond;
  readonly attackRange: Tile;
  readonly modelId: ActorModelId;
  readonly name: string;
  readonly npcType: NpcType;
  readonly aggroRange: Tile;
}

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
