import type { Tile, TimesPerSecond } from "@mp/std";
import type { ActorModelId, CharacterTemplate } from "./types";

export const defaultCharacter: CharacterTemplate = {
  speed: 3 as Tile,
  health: 100,
  maxHealth: 100,
  attackDamage: 5,
  attackSpeed: 1.25 as TimesPerSecond,
  attackRange: 1 as Tile,
  modelId: "adventurer" as ActorModelId,
  xp: 0,
};
