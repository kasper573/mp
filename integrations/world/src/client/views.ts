import type { World, EntityId } from "@rift/core";
import { Appearance } from "../appearance/components";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { Combat } from "../combat/components";
import {
  ConsumableInstance as RiftConsumable,
  EquipmentInstance as RiftEquipment,
} from "../item/components";
import { InventoryRef } from "../inventory/components";
import { Movement } from "../movement/components";
import { NpcAi } from "../npc/components";
import { Progression } from "../progression/components";
import type {
  ActorModelId,
  AreaId,
  CharacterId,
  ConsumableInstanceId,
  ConsumableDefinitionId,
  EquipmentInstanceId,
  EquipmentDefinitionId,
  InventoryId,
  NpcDefinitionId,
  NpcSpawnId,
} from "../identity/ids";
import { Rect, Vector } from "@mp/math";
import type { CardinalDirection, Path } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import type { UserId } from "@mp/auth";

export type ActorId = CharacterId | NpcInstanceId;
export type NpcInstanceId = EntityId & { readonly __npcInstance: true };

export interface AppearanceView {
  readonly modelId: ActorModelId;
  readonly name: string;
  readonly color: number | undefined;
  readonly opacity: number | undefined;
}

export interface MovementView {
  readonly coords: Vector<Tile>;
  readonly speed: Tile;
  readonly dir: CardinalDirection;
  readonly path: Path<Tile>;
}

export interface CombatView {
  readonly hitBox: Rect<Tile>;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly attackDamage: number;
  readonly attackSpeed: TimesPerSecond;
  readonly attackRange: Tile;
}

export interface ProgressionView {
  readonly xp: number;
}

export type ActorType = "character" | "npc";

abstract class ActorBase {
  abstract readonly type: ActorType;
  abstract readonly identity: {
    readonly id: ActorId;
    readonly userId?: UserId;
  };
  constructor(
    protected readonly world: World,
    readonly entityId: EntityId,
  ) {}

  get appearance(): AppearanceView {
    const a = this.world.get(this.entityId, Appearance);
    return {
      modelId: a?.modelId ?? ("" as ActorModelId),
      name: a?.name ?? "",
      color: a?.color,
      opacity: a?.opacity,
    };
  }

  get movement(): MovementView {
    const m = this.world.get(this.entityId, Movement);
    if (!m) {
      return {
        coords: Vector.zero<Tile>(),
        speed: 0 as Tile,
        dir: "s",
        path: [],
      };
    }
    return {
      coords: m.coords,
      speed: m.speed,
      dir: m.direction,
      path: m.path,
    };
  }

  get combat(): CombatView {
    const c = this.world.get(this.entityId, Combat);
    if (!c) {
      return {
        hitBox: new Rect(0 as Tile, 0 as Tile, 1 as Tile, 1 as Tile),
        health: 0,
        maxHealth: 0,
        alive: false,
        attackDamage: 0,
        attackSpeed: 0 as TimesPerSecond,
        attackRange: 0 as Tile,
      };
    }
    return {
      hitBox: c.hitBox,
      health: c.health,
      maxHealth: c.maxHealth,
      alive: c.alive,
      attackDamage: c.attackDamage,
      attackSpeed: c.attackSpeed,
      attackRange: c.attackRange,
    };
  }

  get areaId(): AreaId | undefined {
    return this.world.get(this.entityId, AreaTag)?.areaId;
  }
}

export class Character extends ActorBase {
  readonly type = "character" as const;

  get identity(): { readonly id: CharacterId; readonly userId: UserId } {
    const tag = this.world.get(this.entityId, CharacterTag);
    return {
      id: tag?.characterId ?? ("" as CharacterId),
      userId: tag?.userId ?? ("" as UserId),
    };
  }

  get progression(): ProgressionView {
    return { xp: this.world.get(this.entityId, Progression)?.xp ?? 0 };
  }

  get inventoryId(): InventoryId | undefined {
    return this.world.get(this.entityId, InventoryRef)?.inventoryId;
  }
}

export class NpcInstance extends ActorBase {
  readonly type = "npc" as const;

  get identity(): {
    readonly id: NpcInstanceId;
    readonly npcId: NpcDefinitionId;
    readonly spawnId: NpcSpawnId;
  } {
    const tag = this.world.get(this.entityId, NpcTag);
    return {
      id: this.entityId as NpcInstanceId,
      npcId: tag?.definitionId ?? ("" as NpcDefinitionId),
      spawnId: tag?.spawnId ?? ("" as NpcSpawnId),
    };
  }

  get aggroRange(): Tile {
    return this.world.get(this.entityId, NpcAi)?.aggroRange ?? (0 as Tile);
  }

  get patrol(): Path<Tile> | undefined {
    return this.world.get(this.entityId, NpcAi)?.patrol;
  }
}

export type Actor = Character | NpcInstance;

export interface ConsumableInstanceView {
  readonly type: "consumable";
  readonly id: ConsumableInstanceId;
  readonly definitionId: ConsumableDefinitionId;
  readonly inventoryId: InventoryId;
  readonly stackSize: number;
}

export interface EquipmentInstanceView {
  readonly type: "equipment";
  readonly id: EquipmentInstanceId;
  readonly definitionId: EquipmentDefinitionId;
  readonly inventoryId: InventoryId;
  readonly durability: number;
}

export type ItemInstance = ConsumableInstanceView | EquipmentInstanceView;
export type ItemInstanceId = ConsumableInstanceId | EquipmentInstanceId;

export function readItemInstance(
  world: World,
  entityId: EntityId,
): ItemInstance | undefined {
  const inventoryRef = world.get(entityId, InventoryRef);
  if (!inventoryRef) {
    return undefined;
  }
  const c = world.get(entityId, RiftConsumable);
  if (c) {
    return {
      type: "consumable",
      id: c.instanceId,
      definitionId: c.definitionId,
      inventoryId: inventoryRef.inventoryId,
      stackSize: c.stackSize,
    };
  }
  const e = world.get(entityId, RiftEquipment);
  if (e) {
    return {
      type: "equipment",
      id: e.instanceId,
      definitionId: e.definitionId,
      inventoryId: inventoryRef.inventoryId,
      durability: e.durability,
    };
  }
  return undefined;
}

export function readActor(world: World, entityId: EntityId): Actor | undefined {
  if (world.has(entityId, CharacterTag)) {
    return new Character(world, entityId);
  }
  if (world.has(entityId, NpcTag)) {
    return new NpcInstance(world, entityId);
  }
  return undefined;
}
