import { CharacterIdType, type Character } from "./character";
import { NpcInstanceIdType, type NpcInstance } from "./npc";
import { type } from "@mp/validate";

/** @gqlScalar */
export type ActorId = typeof ActorIdType.infer;
export const ActorIdType = NpcInstanceIdType.or(CharacterIdType);

export type Actor = Character | NpcInstance;

/** @gqlScalar */
export type ActorModelId = typeof ActorModelIdType.infer;
export const ActorModelIdType = type("string").brand("ActorModelId");
