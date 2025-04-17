import type { Character } from "../character/schema";
import type { NpcInstance } from "../npc/schema";

export type ActorId = Actor["id"];

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NpcInstance);
