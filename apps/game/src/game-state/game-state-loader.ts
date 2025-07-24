import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId } from "../area/area-id";
import type { Npc, NpcSpawn } from "../npc/types";
import type { Character } from "../character/types";

export interface GameStateLoader {
  getUserName(userId: UserId): Promise<string>;
  getUserRoles(userId: UserId): Promise<ReadonlySetLike<RoleDefinition>>;
  getAllSpawnsAndTheirNpcs: () => Promise<Array<{ spawn: NpcSpawn; npc: Npc }>>;
  getDefaultSpawnPoint(): { areaId: AreaId; coords: Vector<Tile> };
  getOrCreateCharacterForUser(userId: UserId): Promise<Character>;
}

export const ctxGameStateLoader =
  InjectionContext.new<GameStateLoader>("GameStateLoader");
