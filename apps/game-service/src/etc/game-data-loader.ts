import type { DbClient } from "@mp/db";
import { e } from "@mp/db";
import type { AreaId, CharacterId } from "@mp/db/types";
import type {
  ActorModelLookup,
  AreaResource,
  Character,
  ItemDefinition,
  ItemDefinitionByReference,
  ItemDefinitionLookup,
  Npc,
  NpcReward,
  NpcSpawn,
} from "@mp/game-shared";
import type { Vector } from "@mp/math";
import { assert, type Rng, type Tile, type TimesPerSecond } from "@mp/std";
import type { ActorModelId, NpcId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
import {
  characterFromDbFields,
  consumableDefinitionFromDbFields,
  dbFieldsFromCharacter,
  equipmentDefinitionFromDbFields,
  npcRewardsFromDbFields,
  type DbCharacterFields,
  type DbConsumableDefinitionFields,
  type DbEquipmentDefinitionFields,
  type DbNpcRewardFields,
} from "./db-transform";
import { deriveNpcSpawnsFromArea } from "./npc/derive-npc-spawns-from-areas";
import { deserializeVector } from "@mp/db";

export class GameDataLoader {
  constructor(
    private db: DbClient,
    private area: AreaResource,
    private actorModels: ActorModelLookup,
    private rng: Rng,
  ) {}

  getDefaultSpawnPoint(): { areaId: AreaId; coords: Vector<Tile> } {
    return {
      areaId: "forest" as AreaId,
      coords: this.area.start,
    };
  }

  async saveCharacterToDb(character: Character) {
    const updates = dbFieldsFromCharacter(character);
    await e
      .update(e.Character, (char) => ({
        filter: e.op(char.characterId, "=", e.str(character.identity.id)),
        set: {
          health: updates.health,
          maxHealth: updates.maxHealth,
          attackDamage: updates.attackDamage,
          attackRange: updates.attackRange,
          attackSpeed: updates.attackSpeed,
          xp: updates.xp,
          coords: e.json(updates.coords),
          speed: updates.speed,
        },
      }))
      .run(this.db);
  }

  async assignAreaIdToCharacterInDb(
    characterId: CharacterId,
    newAreaId: AreaId,
  ): Promise<Character> {
    const result = await e
      .params(
        {
          characterId: e.str,
          newAreaId: e.str,
        },
        (params) => {
          return e.select(e.Character, (char) => ({
            characterId: true,
            userId: true,
            name: true,
            inventoryId: true,
            xp: true,
            attackDamage: true,
            attackRange: true,
            attackSpeed: true,
            health: true,
            maxHealth: true,
            coords: true,
            speed: true,
            modelId: {
              modelId: true,
            },
            filter: e.op(char.characterId, "=", params.characterId),
          }));
        },
      )
      .run(this.db, { characterId, newAreaId });

    // First update, then select
    await e
      .update(e.Character, (char) => ({
        filter: e.op(char.characterId, "=", e.str(characterId)),
        set: {
          areaId: e.assert_single(
            e.select(e.Area, (area) => ({
              filter: e.op(area.areaId, "=", e.str(newAreaId)),
            })),
          ),
        },
      }))
      .run(this.db);

    const updated = await e
      .select(e.Character, (char) => ({
        characterId: true,
        userId: true,
        name: true,
        inventoryId: true,
        xp: true,
        attackDamage: true,
        attackRange: true,
        attackSpeed: true,
        health: true,
        maxHealth: true,
        coords: true,
        speed: true,
        modelId: {
          modelId: true,
        },
        filter: e.op(char.characterId, "=", e.str(characterId)),
        limit: 1,
      }))
      .run(this.db);

    if (updated.length === 0) {
      throw new Error(`Character with id ${characterId} not found`);
    }

    const dbFields: DbCharacterFields = {
      characterId: updated[0].characterId as CharacterId,
      userId: updated[0].userId as UserId,
      modelId: updated[0].modelId.modelId as ActorModelId,
      name: updated[0].name,
      inventoryId: updated[0].inventoryId as any,
      xp: updated[0].xp,
      attackDamage: updated[0].attackDamage,
      attackRange: updated[0].attackRange as Tile,
      attackSpeed: updated[0].attackSpeed as TimesPerSecond,
      health: updated[0].health,
      maxHealth: updated[0].maxHealth,
      coords: deserializeVector(updated[0].coords as any),
      speed: updated[0].speed as Tile,
    };

    return characterFromDbFields(dbFields, this.actorModels, this.rng);
  }

  async getAllSpawnsAndTheirNpcs(): Promise<
    Array<{ spawn: NpcSpawn; npc: Npc }>
  > {
    const result = await e
      .select(e.NpcSpawn, (spawn) => ({
        spawnId: true,
        count: true,
        coords: true,
        randomRadius: true,
        patrol: true,
        npcType: true,
        areaId: { areaId: true },
        npcId: {
          npcId: true,
          speed: true,
          maxHealth: true,
          attackDamage: true,
          attackSpeed: true,
          attackRange: true,
          name: true,
          npcType: true,
          aggroRange: true,
          modelId: { modelId: true },
        },
        filter: e.op(spawn.areaId.areaId, "=", e.str(this.area.id)),
      }))
      .run(this.db);

    const allFromDB = result.map((row) => {
      const spawn: NpcSpawn = {
        id: row.spawnId as any,
        count: Number(row.count),
        npcId: row.npcId.npcId as NpcId,
        coords: row.coords ? deserializeVector(row.coords as any) : undefined,
        randomRadius: row.randomRadius ? Number(row.randomRadius) : undefined,
        patrol: undefined, // TODO: deserialize path
        npcType: row.npcType ?? undefined,
      };

      const npc: Npc = {
        id: row.npcId.npcId as NpcId,
        speed: Number(row.npcId.speed) as Tile,
        maxHealth: row.npcId.maxHealth,
        attackDamage: row.npcId.attackDamage,
        attackSpeed: row.npcId.attackSpeed as TimesPerSecond,
        attackRange: row.npcId.attackRange as Tile,
        modelId: row.npcId.modelId.modelId as ActorModelId,
        name: row.npcId.name,
        npcType: row.npcId.npcType,
        aggroRange: row.npcId.aggroRange as Tile,
      };

      return { spawn, npc };
    });

    const allFromTiled = deriveNpcSpawnsFromArea(
      this.area,
      allFromDB.map(({ npc }) => npc),
    );

    return [...allFromDB, ...allFromTiled];
  }

  async getAllNpcRewards(): Promise<NpcReward[]> {
    // Get all rewards for NPCs that spawn in this area
    const result = await e
      .select(e.NpcReward, (reward) => ({
        rewardId: true,
        xp: true,
        itemAmount: true,
        npcId: { npcId: true },
        consumableItemId: { definitionId: true },
        equipmentItemId: { definitionId: true },
        filter: e.op(
          reward.npcId,
          "in",
          e.select(e.NpcSpawn, (spawn) => ({
            filter: e.op(spawn.areaId.areaId, "=", e.str(this.area.id)),
          })).npcId,
        ),
      }))
      .run(this.db);

    const dbFields: DbNpcRewardFields[] = result.map((row) => ({
      rewardId: row.rewardId,
      npcId: row.npcId.npcId as NpcId,
      xp: row.xp,
      consumableItemId: row.consumableItemId?.definitionId as any,
      equipmentItemId: row.equipmentItemId?.definitionId as any,
      itemAmount: row.itemAmount ? Number(row.itemAmount) : null,
    }));

    return dbFields.flatMap(npcRewardsFromDbFields);
  }

  async getAllItemDefinitions(): Promise<ItemDefinition[]> {
    const [equipmentRows, consumableRows] = await Promise.all([
      e
        .select(e.EquipmentDefinition, () => ({
          definitionId: true,
          name: true,
          maxDurability: true,
        }))
        .run(this.db),
      e
        .select(e.ConsumableDefinition, () => ({
          definitionId: true,
          name: true,
          maxStackSize: true,
        }))
        .run(this.db),
    ]);

    const equipment: DbEquipmentDefinitionFields[] = equipmentRows.map(
      (row) => ({
        definitionId: row.definitionId as any,
        name: row.name,
        maxDurability: Number(row.maxDurability),
      }),
    );

    const consumables: DbConsumableDefinitionFields[] = consumableRows.map(
      (row) => ({
        definitionId: row.definitionId as any,
        name: row.name,
        maxStackSize: Number(row.maxStackSize),
      }),
    );

    return [
      ...equipment.map(equipmentDefinitionFromDbFields),
      ...consumables.map(consumableDefinitionFromDbFields),
    ];
  }
}

export function createItemDefinitionLookup(
  itemDefinitions: ItemDefinition[],
): ItemDefinitionLookup {
  const maps = new Map<
    ItemDefinition["type"],
    Map<ItemDefinition["id"], ItemDefinition>
  >();
  for (const def of itemDefinitions) {
    let defs = maps.get(def.type);
    if (!defs) {
      defs = new Map([[def.id, def]]);
      maps.set(def.type, defs);
    } else {
      defs.set(def.id, def);
    }
  }
  return (ref) => {
    return assert(
      maps.get(ref.type)?.get(ref.definitionId),
      // Unfortunate type assertion. I have no idea how to do this better.
    ) as ItemDefinitionByReference<typeof ref>;
  };
}
