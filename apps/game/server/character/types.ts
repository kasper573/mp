import type { Branded, MinimalInput, Tile, TimesPerSecond } from "@mp/std";
import type { UserId } from "@mp/auth";
import { collect, SyncEntity } from "@mp/sync";
import type { Vector, Path, CardinalDirection, Rect } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { ObjectId } from "@mp/tiled-loader";
import { addEncoderExtension } from "@mp/encoding";
import type { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import * as patchOptimizers from "../patch-optimizers";
import type { AreaId } from "../../shared/area/area-id";
import type { ActorId } from "../actor";

export class Character
  extends SyncEntity
  implements AppearanceTrait, MovementTrait, CombatTrait
{
  @collect()
  accessor type = "character" as const;
  @collect()
  accessor id: CharacterId;
  @collect()
  accessor userId: UserId;
  @collect()
  accessor xp: number;
  @collect()
  accessor color: number | undefined; // HEX
  @collect()
  accessor opacity: number | undefined; // 0-1
  @collect()
  accessor modelId: ActorModelId;
  @collect()
  accessor name: string;
  @collect(patchOptimizers.coords)
  accessor coords: Vector<Tile>;
  @collect()
  accessor speed: Tile;
  @collect()
  accessor areaId: AreaId;
  @collect()
  accessor moveTarget: Vector<Tile> | undefined;
  @collect(patchOptimizers.path)
  accessor path: Path<Tile> | undefined;
  @collect()
  accessor dir: CardinalDirection;
  @collect()
  accessor hitBox: Rect<Tile>;
  @collect()
  accessor health: number;
  @collect()
  accessor maxHealth: number;
  @collect()
  accessor attackDamage: number;
  @collect()
  accessor attackSpeed: TimesPerSecond;
  @collect()
  accessor attackRange: Tile;
  @collect()
  accessor attackTargetId: ActorId | undefined;
  @collect()
  accessor lastAttack: TimeSpan | undefined;
  @collect()
  accessor desiredPortalId: ObjectId | undefined;

  constructor(data: Omit<MinimalInput<Character>, "type" | keyof SyncEntity>) {
    super();
    this.type = "character";
    this.id = data.id;
    this.userId = data.userId;
    this.xp = data.xp;
    this.color = data.color;
    this.opacity = data.opacity;
    this.modelId = data.modelId;
    this.name = data.name;
    this.coords = data.coords;
    this.speed = data.speed;
    this.areaId = data.areaId;
    this.moveTarget = data.moveTarget;
    this.path = data.path;
    this.dir = data.dir;
    this.hitBox = data.hitBox;
    this.health = data.health;
    this.maxHealth = data.maxHealth;
    this.attackDamage = data.attackDamage;
    this.attackSpeed = data.attackSpeed;
    this.attackRange = data.attackRange;
    this.attackTargetId = data.attackTargetId;
    this.lastAttack = data.lastAttack;
    this.desiredPortalId = data.desiredPortalId;
  }
}

// TODO move to encoder-extensions.ts when game package has been refactored to be organized by domain rathr than client/server.
addEncoderExtension<Character, Partial<Character>>({
  Class: Character as never,
  tag: 40_600,
  encode: (character, encode) => encode(character.snapshot()),
  // TODO instantiate Character from snapshot
  decode: (snapshot) => snapshot as Character,
});

export type CharacterId = Branded<string, "CharacterId">;
