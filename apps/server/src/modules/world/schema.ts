import type { Vector, Path } from "@mp/math";
import type { AreaId, Branded } from "@mp/state";

export interface WorldState {
  characters: Map<CharacterId, Character>;
}

export interface Character {
  connected: boolean;
  id: CharacterId;
  coords: Vector;
  path: Path;
  speed: number;
  areaId: AreaId;
}

export type CharacterId = Branded<string, "CharacterId">;
