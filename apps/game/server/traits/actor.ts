import type { Character, CharacterId } from "../character/types";
import type { NpcInstance, NpcInstanceId } from "../npc/types";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NpcInstance);
