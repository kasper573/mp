import { InjectionContext } from "@mp/ioc";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId } from "../area/area-id";
import type { Npc, NpcSpawn } from "../npc/types";
import type { Character, CharacterId } from "../character/types";

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
