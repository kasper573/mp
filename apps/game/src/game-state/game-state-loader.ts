import { InjectionContext } from "@mp/ioc";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId } from "../area/area-id";
import type { Npc, NpcSpawn } from "../npc/types";

export interface GameStateLoader {
  getAllSpawnsAndTheirNpcs: () => Promise<Array<{ spawn: NpcSpawn; npc: Npc }>>;
  getDefaultSpawnPoint(): { areaId: AreaId; coords: Vector<Tile> };
}

export const ctxGameStateLoader =
  InjectionContext.new<GameStateLoader>("GameStateLoader");
