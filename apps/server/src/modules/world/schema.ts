import type { VectorLike, Path } from "@mp/excalibur";
import type { AreaId, Branded } from "@mp/state";

export interface WorldState {
  characters: Map<CharacterId, Character>;
}

export interface Character {
  connected: boolean;
  id: CharacterId;
  coords: VectorLike;
  path: Path;
  speed: number;
  areaId: AreaId;
}

export type CharacterId = Branded<string, "CharacterId">;
