import type { Path, VectorLike } from "@mp/excalibur";
import type { AreaId, Branded } from "@mp/state";

export type CharacterId = Branded<string, "CharacterId">;

export interface Character {
  connected: boolean;
  id: CharacterId;
  coords: VectorLike;
  path: Path;
  speed: number;
  areaId: AreaId;
}
