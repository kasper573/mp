import type { DbClient } from "@mp/db";
import {
  Character as CharacterEntity,
  ConsumableInstance as ConsumableInstanceEntity,
  EquipmentInstance as EquipmentInstanceEntity,
} from "@mp/db";
import { In } from "typeorm";
import type { AreaId, CharacterId } from "@mp/db/types";
import type { Character, ItemInstance, ItemInstanceId } from "@mp/game-shared";
import {
  ConsumableInstance,
  EquipmentInstance,
  type ActorModelLookup,
  type AreaResource,
  type GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { assert, type Rng } from "@mp/std";
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
  async function sync() {
    await save();
    await load();
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
  async function load() {
    const dbIds = await getOnlineCharacterIdsForAreaFromDb(db, area.id);
    const stateIds = characterIdsInState(state);
    const removedIds = stateIds.difference(dbIds);
    const addedIds = dbIds.difference(stateIds);

    removedIds.forEach(removeCharacterFromGameState);

    if (addedIds.size) {
      const addedCharacters = await db.getRepository(CharacterEntity).find({
        where: {
          id: In(addedIds.values().toArray()),
        },
      });

      addedCharacters.forEach(addCharacterToGameState);
    }

    const inventoryIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.inventoryId] : [])),
    );

    const [consumableInstanceFields, equipmentInstanceFields] =
      await Promise.all([
        db.getRepository(ConsumableInstanceEntity).find({
          where: {
            inventoryId: In(inventoryIds.values().toArray()),
          },
        }),
        db.getRepository(EquipmentInstanceEntity).find({
          where: {
            inventoryId: In(inventoryIds.values().toArray()),
          },
        }),
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
    return db.transaction(async (manager) => {
      await Promise.all(
        state.actors
          .values()
          .filter((actor) => actor.type === "character")
          .map((char) =>
            manager
              .getRepository(CharacterEntity)
              .update(char.identity.id, dbFieldsFromCharacter(char)),
          ),
      );

      await Promise.all(
        state.items.values().map((item) => {
          const Entity = {
            consumable: ConsumableInstanceEntity,
            equipment: EquipmentInstanceEntity,
          }[item.type];
          return manager.getRepository(Entity).save(item);
        }),
      );
    });
  }

  function upsertItemInstancesInGameState(
    dbConsumables: Array<ConsumableInstanceEntity>,
    dbEquipment: Array<EquipmentInstanceEntity>,
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

  function addCharacterToGameState(characterFields: CharacterEntity) {
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

  return startAsyncInterval(
    () =>
      sync().catch((err) => logger.error(err, "game state db sync save error")),
    syncInterval,
  );
}

const syncInterval = TimeSpan.fromSeconds(5);

async function getOnlineCharacterIdsForAreaFromDb(
  db: DbClient,
  areaId: AreaId,
): Promise<ReadonlySet<CharacterId>> {
  const characters = await db.getRepository(CharacterEntity).find({
    select: ["id"],
    where: {
      areaId,
      online: true,
    },
  });
  return new Set(characters.map((char) => char.id));
}

function characterIdsInState(state: GameState): ReadonlySet<CharacterId> {
  return new Set(
    state.actors
      .values()
      .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
  );
}
