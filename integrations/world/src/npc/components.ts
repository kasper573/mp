import { array, enumOf, f32, object, optional } from "@rift/types";
import type { Tile } from "@mp/std";
import { npcTypes } from "./definitions";
import { TileVector } from "../movement/components";

export const NpcAi = object({
  npcType: enumOf(...npcTypes),
  aggroRange: f32<Tile>(),
  // Base movement speed; restored when an NPC loses its aggro target.
  // The AI module bumps Movement.speed to a multiple of this while chasing.
  idleSpeed: f32<Tile>(),
  patrol: optional(array(TileVector)),
});

export const npcComponents = [NpcAi] as const;
export const npcEvents = [] as const;
