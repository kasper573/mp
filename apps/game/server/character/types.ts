import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { Vector } from "@mp/math";
import type { UserId } from "@mp/auth";
import type { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import type { AreaId } from "../../shared/area/area-id";

export interface Character extends AppearanceTrait, MovementTrait, CombatTrait {
  id: CharacterId;
  coords: Vector<Tile>;
  areaId: AreaId;
  speed: Tile;
  userId: UserId;
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  modelId: ActorModelId;
  name: string;
  xp: number;
}

export type CharacterId = Branded<string, "CharacterId">;
