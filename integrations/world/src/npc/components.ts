import { array, enumOf, f32, object, optional } from "@rift/types";
import type { Tile } from "@mp/std";
import { npcTypes } from "./definitions";
import { TileVector } from "../primitives";

export const NpcAi = object({
  npcType: enumOf(...npcTypes),
  aggroRange: f32<Tile>(),
  idleSpeed: f32<Tile>(),
  patrol: optional(array(TileVector)),
});

export const npcComponents = [NpcAi] as const;
