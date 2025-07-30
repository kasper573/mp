import type { CharacterId } from "@mp/db/types";
import type { Character } from "../character/types";
import type { NpcInstance, NpcInstanceId } from "../npc/types";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor = Character | NpcInstance;
