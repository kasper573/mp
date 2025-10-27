import type {
  AreaResource,
  GameState,
  ActorModelLookup,
  ItemInstanceId,
  ItemInstance,
  Character,
} from "@mp/game-shared";
import { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { assert } from "@mp/std";
import { inArray, and, eq } from "drizzle-orm";
import { DbClient } from "../client";
import {
  characterTable,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "../schema";
import { dbFieldsFromCharacter, characterFromDbFields } from "../transform";
import type { CharacterId, AreaId } from "@mp/game-shared";

export interface SyncGameStateOptions {
  db: DbClient;
  area: AreaResource;
  state: GameState;
  actorModels: ActorModelLookup;
  logger: Logger;
  markToResendFullState: (characterId: CharacterId) => void;
}

/**
 * Polls the database for game state changes and updates the game state accordingly.
 * Only adds and removes are applied. Db updates to entities that already exist in game state will be ignored.
 *
 * This means external systems cannot really reliably update game state tables in the db,
 * since those changes may be overwritten by game services.
 * This is an intentional limitation to keep the sync system simple.
 * If we ever need external systems to manipiulate persisted game state we'll have to look into more robust sync mechanisms.
 */
export async function syncGameState({
  db,
  area,
  state,
  actorModels,
  logger,
  markToResendFullState,
}: SyncGameStateOptions) {
  const drizzle = DbClient.unwrap(db);

  await save();
  await load();

  async function load() {
    const dbIds = await getOnlineCharacterIdsForAreaFromDb(db, area.id);
    const stateIds = characterIdsInState(state);
    const removedIds = stateIds.difference(dbIds);
    const addedIds = dbIds.difference(stateIds);

    removedIds.forEach(removeCharacterFromGameState);

    if (addedIds.size) {
      const addedCharacters = await drizzle
        .select()
        .from(characterTable)
        .where(inArray(characterTable.id, addedIds.values().toArray()));

      addedCharacters.forEach(addCharacterToGameState);
    }

    const inventoryIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.inventoryId] : [])),
    );

    const [consumableInstanceFields, equipmentInstanceFields] =
      await Promise.all([
        drizzle
          .select()
          .from(consumableInstanceTable)
          .where(
            inArray(
              consumableInstanceTable.inventoryId,
              inventoryIds.values().toArray(),
            ),
          ),
        drizzle
          .select()
          .from(equipmentInstanceTable)
          .where(
            inArray(
              equipmentInstanceTable.inventoryId,
              inventoryIds.values().toArray(),
            ),
          ),
      ]);

    upsertItemInstancesInGameState(
      consumableInstanceFields,
      equipmentInstanceFields,
    );
  }

  /**
   * Updates the database with the current game state.
   */
  function save() {
    return drizzle.transaction(async (tx) => {
      await Promise.all(
        state.actors
          .values()
          .filter((actor) => actor.type === "character")
          .map((char) =>
            tx.update(characterTable).set(dbFieldsFromCharacter(char)),
          ),
      );

      await Promise.all(
        state.items.values().map((item) => {
          const table = {
            consumable: consumableInstanceTable,
            equipment: equipmentInstanceTable,
          }[item.type];
          return tx
            .insert(table)
            .values(item)
            .onConflictDoUpdate({
              target: [table.id],
              set: item,
            });
        }),
      );
    });
  }

  function upsertItemInstancesInGameState(
    dbConsumables: Array<typeof consumableInstanceTable.$inferSelect>,
    dbEquipment: Array<typeof equipmentInstanceTable.$inferSelect>,
  ) {
    const dbFields = new Map<ItemInstanceId, ItemInstance>();

    for (const fields of dbConsumables) {
      dbFields.set(fields.id, { type: "consumable", ...fields });
    }
    for (const fields of dbEquipment) {
      dbFields.set(fields.id, { type: "equipment", ...fields });
    }

    const dbIds = new Set(dbFields.keys());
    const stateIds = new Set(state.items.keys());
    const removedIds = stateIds.difference(dbIds);
    const addedIds = dbIds.difference(stateIds);

    for (const itemId of removedIds) {
      state.items.delete(itemId);
    }

    for (const itemId of addedIds) {
      let instance = state.items.get(itemId);
      const itemFields = assert(dbFields.get(itemId));
      if (!instance) {
        switch (itemFields.type) {
          case "consumable":
            instance = ConsumableInstance.create(itemFields);
            break;
          case "equipment":
            instance = EquipmentInstance.create(itemFields);
            break;
        }
        state.items.set(itemFields.id, instance);
        logger.debug(
          { itemId: itemFields.id, type: itemFields.type },
          "Added item instance to game state",
        );
      }
    }
  }

  function addCharacterToGameState(
    characterFields: typeof characterTable.$inferSelect,
  ) {
    const char = characterFromDbFields(characterFields, actorModels);
    state.actors.set(char.identity.id, char);
    markToResendFullState(char.identity.id);
    logger.debug(
      { characterId: characterFields.id },
      "Character joined game service via db poll",
    );
  }

  function removeCharacterFromGameState(characterId: CharacterId) {
    const char = state.actors.get(characterId) as Character | undefined;
    state.actors.delete(characterId);
    for (const item of state.items.values()) {
      if (item.inventoryId === char?.inventoryId) {
        state.items.delete(item.id);
      }
    }
    logger.debug({ characterId }, "Character left game service via db poll");
  }
}

async function getOnlineCharacterIdsForAreaFromDb(
  db: DbClient,
  areaId: AreaId,
): Promise<ReadonlySet<CharacterId>> {
  const drizzle = DbClient.unwrap(db);
  return new Set(
    (
      await drizzle
        .select({ id: characterTable.id })
        .from(characterTable)
        .where(
          and(
            eq(characterTable.areaId, areaId),
            eq(characterTable.online, true),
          ),
        )
    ).map((row) => row.id),
  );
}

function characterIdsInState(state: GameState): ReadonlySet<CharacterId> {
  return new Set(
    state.actors
      .values()
      .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
  );
}
