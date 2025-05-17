import type { Character, CharacterId } from "../character/schema";
import type { NpcInstance, NpcInstanceId } from "../npc/schema";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NpcInstance);
