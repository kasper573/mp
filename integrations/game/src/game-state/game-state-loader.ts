import type { AreaId, CharacterId } from "@mp/db/types";
import { InjectionContext } from "@mp/ioc";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { Character } from "../character/types";
import type { Npc, NpcSpawn } from "../npc/types";

export interface GameStateLoader {
  getAllSpawnsAndTheirNpcs: () => Promise<Array<{ spawn: NpcSpawn; npc: Npc }>>;
  getDefaultSpawnPoint(): { areaId: AreaId; coords: Vector<Tile> };
  assignAreaIdToCharacterInDb(
    characterId: CharacterId,
    areaId: AreaId,
  ): Promise<Character>;
  saveCharacterToDb(character: Character): Promise<void>;
}

export const ctxGameStateLoader =
  InjectionContext.new<GameStateLoader>("GameStateLoader");
