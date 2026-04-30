import type { Tile } from "@mp/std";
import type { Vector } from "@mp/math";
import type { AreaId } from "../identity/ids";

export interface AreaMeta {
  readonly id: AreaId;
  readonly displayName: string;
  readonly spawnPoint: Vector<Tile>;
}
