import type { UserId } from "@mp/oauth";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import type {
  ActorModelId,
  AreaId,
  CharacterId,
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
  InventoryId,
  NpcId,
  NpcRewardId,
  NpcSpawnId,
} from "./types";
import { npcTypes } from "./types";
import { VectorTransformer } from "./types/vector";
import { PathTransformer } from "./types/path";

@Entity("actor_model")
export class ActorModel {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id!: ActorModelId;
}

@Entity("area")
export class Area {
  @PrimaryColumn({ type: "varchar", length: 60 })
  id!: AreaId;
}

@Entity("inventory")
export class Inventory {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: InventoryId;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as InventoryId;
    }
  }
}

@Entity("consumable_definition")
export class ConsumableDefinition {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: ConsumableDefinitionId;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "integer" })
  maxStackSize!: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as ConsumableDefinitionId;
    }
  }
}

@Entity("consumable_instance")
export class ConsumableInstance {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: ConsumableInstanceId;

  @Column({ type: "varchar", length: 21 })
  definitionId!: ConsumableDefinitionId;

  @ManyToOne(() => ConsumableDefinition)
  @JoinColumn({ name: "definitionId" })
  definition!: ConsumableDefinition;

  @Column({ type: "varchar", length: 21 })
  inventoryId!: InventoryId;

  @ManyToOne(() => Inventory)
  @JoinColumn({ name: "inventoryId" })
  inventory!: Inventory;

  @Column({ type: "integer" })
  stackSize!: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as ConsumableInstanceId;
    }
  }
}

@Entity("equipment_definition")
export class EquipmentDefinition {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: EquipmentDefinitionId;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "integer" })
  maxDurability!: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as EquipmentDefinitionId;
    }
  }
}

@Entity("equipment_instance")
export class EquipmentInstance {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: EquipmentInstanceId;

  @Column({ type: "varchar", length: 21 })
  definitionId!: EquipmentDefinitionId;

  @ManyToOne(() => EquipmentDefinition)
  @JoinColumn({ name: "definitionId" })
  definition!: EquipmentDefinition;

  @Column({ type: "varchar", length: 21 })
  inventoryId!: InventoryId;

  @ManyToOne(() => Inventory)
  @JoinColumn({ name: "inventoryId" })
  inventory!: Inventory;

  @Column({ type: "integer" })
  durability!: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as EquipmentInstanceId;
    }
  }
}

@Entity("character")
export class Character {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: CharacterId;

  @Column({ type: "point", transformer: new VectorTransformer<Tile>() })
  coords!: { x: number; y: number };

  @Column({ type: "varchar", length: 60 })
  areaId!: AreaId;

  @ManyToOne(() => Area)
  @JoinColumn({ name: "areaId" })
  area!: Area;

  @Column({ type: "real" })
  speed!: Tile;

  @Column({ type: "uuid" })
  userId!: UserId;

  @Column({ type: "real" })
  health!: number;

  @Column({ type: "real" })
  maxHealth!: number;

  @Column({ type: "real" })
  attackDamage!: number;

  @Column({ type: "real" })
  attackSpeed!: TimesPerSecond;

  @Column({ type: "real" })
  attackRange!: Tile;

  @Column({ type: "varchar", length: 64 })
  modelId!: ActorModelId;

  @ManyToOne(() => ActorModel)
  @JoinColumn({ name: "modelId" })
  model!: ActorModel;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "boolean", default: false })
  online!: boolean;

  @Column({ type: "real" })
  xp!: number;

  @Column({ type: "varchar", length: 21 })
  inventoryId!: InventoryId;

  @ManyToOne(() => Inventory)
  @JoinColumn({ name: "inventoryId" })
  inventoryRef!: Inventory;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as CharacterId;
    }
  }
}

@Entity("npc")
export class Npc {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: NpcId;

  @Column({ type: "integer" })
  speed!: Tile;

  @Column({ type: "real" })
  maxHealth!: number;

  @Column({ type: "real" })
  attackDamage!: number;

  @Column({ type: "real" })
  attackSpeed!: TimesPerSecond;

  @Column({ type: "real" })
  attackRange!: Tile;

  @Column({ type: "varchar", length: 64 })
  modelId!: ActorModelId;

  @ManyToOne(() => ActorModel)
  @JoinColumn({ name: "modelId" })
  model!: ActorModel;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({
    type: "varchar",
    enum: npcTypes,
  })
  npcType!: (typeof npcTypes)[number];

  @Column({ type: "real" })
  aggroRange!: Tile;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as NpcId;
    }
  }
}

@Entity("npc_reward")
export class NpcReward {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: NpcRewardId;

  @Column({ type: "varchar", length: 21 })
  npcId!: NpcId;

  @ManyToOne(() => Npc)
  @JoinColumn({ name: "npcId" })
  npc!: Npc;

  @Column({ type: "varchar", length: 21, nullable: true })
  consumableItemId?: ConsumableDefinitionId;

  @ManyToOne(() => ConsumableDefinition, { nullable: true })
  @JoinColumn({ name: "consumableItemId" })
  consumableItem?: ConsumableDefinition;

  @Column({ type: "varchar", length: 21, nullable: true })
  equipmentItemId?: EquipmentDefinitionId;

  @ManyToOne(() => EquipmentDefinition, { nullable: true })
  @JoinColumn({ name: "equipmentItemId" })
  equipmentItem?: EquipmentDefinition;

  @Column({ type: "integer", nullable: true })
  itemAmount?: number;

  @Column({ type: "real", nullable: true })
  xp?: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as NpcRewardId;
    }
  }
}

@Entity("npc_spawn")
export class NpcSpawn {
  @PrimaryColumn({ type: "varchar", length: 21 })
  id!: NpcSpawnId;

  @Column({ type: "integer" })
  count!: number;

  @Column({ type: "varchar", length: 60 })
  areaId!: AreaId;

  @ManyToOne(() => Area)
  @JoinColumn({ name: "areaId" })
  area!: Area;

  @Column({ type: "varchar", length: 21 })
  npcId!: NpcId;

  @ManyToOne(() => Npc)
  @JoinColumn({ name: "npcId" })
  npc!: Npc;

  @Column({
    type: "point",
    nullable: true,
    transformer: new VectorTransformer<Tile>(),
  })
  coords?: { x: number; y: number };

  @Column({ type: "integer", nullable: true })
  randomRadius?: number;

  @Column({
    type: "jsonb",
    nullable: true,
    transformer: new PathTransformer<Tile>(),
  })
  patrol?: Array<{ x: number; y: number }>;

  @Column({
    type: "varchar",
    enum: npcTypes,
    nullable: true,
  })
  npcType?: (typeof npcTypes)[number];

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = createShortId() as NpcSpawnId;
    }
  }
}
