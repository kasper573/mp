import type { Branded, MinimalInput, Tile, TimesPerSecond } from "@mp/std";
import type { UserId } from "@mp/auth";
import { collect } from "@mp/sync";
import type { Vector, Path, CardinalDirection, Rect } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import type { AreaId } from "../../shared/area/area-id";
import type { ActorId } from "../traits/actor";
import * as patchOptimizers from "../patch-optimizers";

export class Character implements AppearanceTrait, MovementTrait, CombatTrait {
  @collect()
  accessor type = "character" as const;
  @collect()
  accessor id!: CharacterId;
  @collect()
  accessor userId!: UserId;
  @collect()
  accessor xp!: number;
  @collect()
  accessor color!: number | undefined; // HEX
  @collect()
  accessor opacity!: number | undefined; // 0-1
  @collect()
  accessor modelId!: ActorModelId;
  @collect()
  accessor name!: string;
  @collect(patchOptimizers.coords)
  accessor coords!: Vector<Tile>;
  @collect()
  accessor speed!: Tile;
  @collect()
  accessor areaId!: AreaId;
  @collect()
  accessor moveTarget!: Vector<Tile> | undefined;
  @collect(patchOptimizers.path)
  accessor path!: Path<Tile> | undefined;
  @collect()
  accessor dir!: CardinalDirection;
  @collect()
  accessor hitBox!: Rect<Tile>;
  @collect()
  accessor health!: number;
  @collect()
  accessor maxHealth!: number;
  @collect()
  accessor attackDamage!: number;
  @collect()
  accessor attackSpeed!: TimesPerSecond;
  @collect()
  accessor attackRange!: Tile;
  @collect()
  accessor attackTargetId!: ActorId | undefined;
  @collect()
  accessor lastAttack!: TimeSpan | undefined;

  private constructor() {}

  static create(data: Omit<MinimalInput<Character>, "type">): Character {
    const instance = new Character();
    instance.type = "character";
    Object.assign(instance, data);
    return instance;
  }
}

export type CharacterId = Branded<string, "CharacterId">;
