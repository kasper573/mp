import type { CharacterId } from "@mp/db/types";
import type { Character } from "./character";
import type { NpcInstance, NpcInstanceId } from "./npc";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor = Character | NpcInstance;
