import type { Character } from "./character";
import type { CharacterId } from "./ids";
import type { NpcInstance, NpcInstanceId } from "./npc";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor = Character | NpcInstance;
