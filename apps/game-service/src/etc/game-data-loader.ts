import type { DbClient } from "@mp/db";
import {
  and,
  characterTable,
  consumableDefinitionTable,
  eq,
  equipmentDefinitionTable,
  exists,
  npcRewardTable,
  npcSpawnTable,
  npcTable,
} from "@mp/db";
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
import { assert, type Rng, type Tile } from "@mp/std";
import {
  characterFromDbFields,
  consumableDefinitionFromDbFields,
  dbFieldsFromCharacter,
  equipmentDefinitionFromDbFields,
  npcRewardsFromDbFields,
} from "./db-transform";
import { deriveNpcSpawnsFromArea } from "./npc/derive-npc-spawns-from-areas";

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
    await this.db
      .update(characterTable)
      .set(dbFieldsFromCharacter(character))
      .where(eq(characterTable.id, character.identity.id));
  }

  async assignAreaIdToCharacterInDb(
    characterId: CharacterId,
    newAreaId: AreaId,
  ): Promise<Character> {
    const result = await this.db.transaction(async (tx) => {
      await tx
        .update(characterTable)
        .set({ areaId: newAreaId })
        .where(eq(characterTable.id, characterId));

      return tx
        .select()
        .from(characterTable)
        .where(eq(characterTable.id, characterId))
        .limit(1);
    });

    if (result.length === 0) {
      throw new Error(`Character with id ${characterId} not found`);
    }

    return characterFromDbFields(result[0], this.actorModels, this.rng);
  }

  async getAllSpawnsAndTheirNpcs(): Promise<
    Array<{ spawn: NpcSpawn; npc: Npc }>
  > {
    const result = await this.db
      .select()
      .from(npcSpawnTable)
      .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id))
      .where(eq(npcSpawnTable.areaId, this.area.id));

    const allFromDB = result.map(({ npc, npc_spawn: spawn }) => {
      if (!npc) {
        throw new Error(`NPC spawn ${spawn.id} has no NPC`);
      }
      return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
    });

    const allFromTiled = deriveNpcSpawnsFromArea(
      this.area,
      allFromDB.map(({ npc }) => npc),
    );

    return [...allFromDB, ...allFromTiled];
  }

  async getAllNpcRewards(): Promise<NpcReward[]> {
    const isRewardForThisAreaQuery = this.db
      .select()
      .from(npcSpawnTable)
      .where(
        and(
          eq(npcSpawnTable.areaId, this.area.id),
          eq(npcRewardTable.npcId, npcSpawnTable.npcId),
        ),
      );

    const rows = await this.db
      .select()
      .from(npcRewardTable)
      .where(exists(isRewardForThisAreaQuery));

    return rows.flatMap(npcRewardsFromDbFields);
  }

  async getAllItemDefinitions(): Promise<ItemDefinition[]> {
    const [equipmentRows, consumableRows] = await Promise.all([
      this.db.select().from(equipmentDefinitionTable),
      this.db.select().from(consumableDefinitionTable),
    ]);

    return [
      ...equipmentRows.map(equipmentDefinitionFromDbFields),
      ...consumableRows.map(consumableDefinitionFromDbFields),
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
