import { CharacterIdType, type Character } from "./character";
import { NpcInstanceIdType, type NpcInstance } from "./npc";
import { type } from "@mp/validate";

export type ActorId = typeof ActorIdType.infer;
export const ActorIdType = NpcInstanceIdType.or(CharacterIdType);

export type Actor = Character | NpcInstance;

export const ActorModelIdType = type("string").brand("ActorModelId");
export type ActorModelId = typeof ActorModelIdType.infer;
