import type { UserIdentity } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId } from "../../shared/area/area-id";
import type { Character } from "./types";

export interface CharacterService {
  getDefaultSpawnPoint(): { areaId: AreaId; coords: Vector<Tile> };
  getOrCreateCharacterForUser(user: UserIdentity): Promise<Character>;
}

export const ctxCharacterService =
  InjectionContext.new<CharacterService>("CharacterService");
