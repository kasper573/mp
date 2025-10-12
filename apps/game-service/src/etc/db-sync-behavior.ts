import type { DbClient } from "@mp/db";
import {
  and,
  characterTable,
  eq,
  inArray,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Character } from "@mp/game-shared";
import {
  ConsumableInstance,
  EquipmentInstance,
  type ActorModelLookup,
  type AreaResource,
  type GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { typedAssign, type Rng } from "@mp/std";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import { characterFromDbFields, dbFieldsFromCharacter } from "./db-transform";
import type { GameStateServer } from "./game-state-server";

export function gameStateDbSyncBehavior(
  db: DbClient,
  area: AreaResource,
  state: GameState,
  server: GameStateServer,
  actorModels: ActorModelLookup,
  rng: Rng,
  logger: Logger,
) {
  /**
   * Polls the database for game state changes and updates the game state accordingly.
   */
  async function poll() {
    const desiredIds = new Set(
      (
        await db
          .select({ id: characterTable.id })
          .from(characterTable)
          .where(
            and(
              eq(characterTable.areaId, area.id),
              eq(characterTable.online, true),
            ),
          )
      ).map((row) => row.id),
    );

    const activeIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
    );
    const removedIds = activeIds.difference(desiredIds);
    const addedIds = desiredIds.difference(activeIds);

    removedIds.forEach(removeCharacterFromGameState);

    if (addedIds.size) {
      const addedCharacters = await db
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
        db
          .select()
          .from(consumableInstanceTable)
          .where(
            inArray(
              consumableInstanceTable.inventoryId,
              inventoryIds.values().toArray(),
            ),
          ),
        db
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
    return db.transaction(async (tx) => {
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
    const dbFields = [
      ...dbConsumables.map((fields) => ({
        type: "consumable" as const,
        ...fields,
      })),
      ...dbEquipment.map((fields) => ({
        type: "equipment" as const,
        ...fields,
      })),
    ];

    for (const itemFields of dbFields) {
      let instance = state.items.get(itemFields.id);
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
      } else {
        // TODO fix race condition. this currently races with in memory changes made in the game service.
        // will need some kind of updatedAt check or something.
        typedAssign(instance, itemFields);
      }
    }
  }

  function addCharacterToGameState(
    characterFields: typeof characterTable.$inferSelect,
  ) {
    const char = characterFromDbFields(characterFields, actorModels, rng);
    state.actors.set(char.identity.id, char);
    server.markToResendFullState(char.identity.id);
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

  const stopSaving = startAsyncInterval(
    () =>
      save().catch((err) => logger.error(err, "game state db sync save error")),
    saveInterval,
  );

  const stopPolling = startAsyncInterval(
    () =>
      poll().catch((err) => logger.error(err, "game state db sync poll error")),
    pollInterval,
  );

  return function stop() {
    stopSaving();
    stopPolling();
  };
}

const pollInterval = TimeSpan.fromSeconds(3);
const saveInterval = TimeSpan.fromSeconds(5);
