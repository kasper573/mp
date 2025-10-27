import type { Branded } from "@mp/std";
import type { Character } from "./character";
import type { CharacterId } from "./character";
import type { NpcInstance, NpcInstanceId } from "./npc";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor = Character | NpcInstance;
export type ActorModelId = Branded<string, "ActorModelId">;
