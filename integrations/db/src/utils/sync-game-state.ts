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
import { assert, ResultAsync } from "@mp/std";
import { inArray, and, eq } from "drizzle-orm";
import {
  characterTable,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "../schema";
import { dbFieldsFromCharacter, characterFromDbFields } from "./transform";
import type { CharacterId, AreaId } from "@mp/game-shared";
import type { DrizzleClient } from "./client";
import { Shape, ShapeStream } from "@electric-sql/client";
import { startAsyncInterval, TimeSpan } from "@mp/time";

export interface SyncGameStateOptions {
  area: AreaResource;
  state: GameState;
  actorModels: ActorModelLookup;
  logger: Logger;
  markToResendFullState: (characterId: CharacterId) => void;
  electricUrl?: string;
}

export interface SyncGameStateSession {
  /**
   * Save current game state to the database
   */
  save: () => Promise<void>;
  /**
   * Stop the sync session and clean up resources
   */
  stop: () => void;
  /**
   * Forcefully flushes any pending sync operations to the database.
   */
  flush: () => void;
}

/**
 * Syncs game state with the database using Electric SQL for real-time updates.
 *
 * This implementation uses Electric's Shape API to subscribe to database changes in real-time,
 * eliminating the need for polling. Writes are still done directly to the database via Drizzle ORM.
 *
 * When electricUrl is provided, this creates persistent subscriptions that receive push notifications
 * from Electric. When not provided, falls back to the original polling-based approach for backwards compatibility.
 *
 * Only adds and removes are applied. Db updates to entities that already exist in game state will be ignored.
 * This is an intentional limitation to keep the sync system simple.
 */
export function syncGameState(
  drizzle: DrizzleClient,
  {
    area,
    state,
    actorModels,
    logger,
    markToResendFullState,
    electricUrl,
  }: SyncGameStateOptions,
) {
  // If Electric URL is provided, use real-time sync; otherwise fall back to polling
  if (electricUrl) {
    return ResultAsync.fromPromise(
      createElectricSyncSession(drizzle, {
        area,
        state,
        actorModels,
        logger,
        markToResendFullState,
        electricUrl,
      }),
      (e) => e,
    );
  }

  // Backwards compatible: single sync operation for polling
  return ResultAsync.fromPromise(save().then(load), (e) => e);

  async function load() {
    const dbIds = await getOnlineCharacterIdsForAreaFromDb(drizzle, area.id);
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
            tx
              .update(characterTable)
              .set(dbFieldsFromCharacter(char))
              .where(eq(characterTable.id, char.identity.id)),
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
  drizzle: DrizzleClient,
  areaId: AreaId,
): Promise<ReadonlySet<CharacterId>> {
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

/**
 * Creates an Electric-based sync session with persistent subscriptions.
 * This returns a session object that manages the Electric Shape subscriptions.
 */
async function createElectricSyncSession(
  drizzle: DrizzleClient,
  options: Required<Omit<SyncGameStateOptions, "electricUrl">> & {
    electricUrl: string;
  },
): Promise<SyncGameStateSession> {
  const {
    area,
    state,
    actorModels,
    logger,
    markToResendFullState,
    electricUrl,
  } = options;

  let characterShape: Shape<Record<string, unknown>> | null = null;
  let consumableShape: Shape<Record<string, unknown>> | null = null;
  let equipmentShape: Shape<Record<string, unknown>> | null = null;

  // Track current inventory IDs to update item shapes when characters change
  let currentInventoryIds = new Set<string>();

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
            tx
              .update(characterTable)
              .set(dbFieldsFromCharacter(char))
              .where(eq(characterTable.id, char.identity.id)),
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
          "Added item instance to game state via Electric",
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
      "Character joined game service via Electric sync",
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
    logger.debug(
      { characterId },
      "Character left game service via Electric sync",
    );
  }

  /**
   * Handle character changes from Electric
   */
  async function handleCharacterChanges(
    charactersData: Map<string, Record<string, unknown>>,
  ) {
    const dbIds = new Set(charactersData.keys());
    const stateIds = characterIdsInState(state);
    const removedIds = stateIds.difference(dbIds);
    const addedIds = dbIds.difference(stateIds);

    // Remove characters that are no longer in the DB
    removedIds.forEach(removeCharacterFromGameState);

    // Add new characters from the DB
    if (addedIds.size > 0) {
      const addedCharacters = await drizzle
        .select()
        .from(characterTable)
        .where(
          inArray(characterTable.id, Array.from(addedIds) as CharacterId[]),
        );

      addedCharacters.forEach(addCharacterToGameState);
    }

    // Update item shapes when characters change
    const newInventoryIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.inventoryId] : [])),
    );

    const inventoryIdsChanged =
      newInventoryIds.size !== currentInventoryIds.size ||
      !Array.from(newInventoryIds).every((id) => currentInventoryIds.has(id));

    if (inventoryIdsChanged) {
      currentInventoryIds = newInventoryIds;
      updateItemShapes();
    }
  }

  /**
   * Update item shapes based on current inventory IDs
   */
  function updateItemShapes() {
    const inventoryIds = Array.from(currentInventoryIds);

    if (inventoryIds.length === 0) {
      // No characters, no items to sync
      return;
    }

    // Create/recreate consumable shape
    const consumableWhere = `inventory_id IN (${inventoryIds.map((id) => `'${id}'`).join(",")})`;

    const consumableStream = new ShapeStream({
      url: `${electricUrl}/v1/shape`,
      params: {
        table: "consumable_instance",
        where: consumableWhere,
      },
    });

    consumableShape = new Shape(consumableStream);

    consumableShape.subscribe(({ value }) => {
      const items = Array.from(value.values()).map(
        (item) =>
          item as unknown as typeof consumableInstanceTable.$inferSelect,
      );
      upsertItemInstancesInGameState(items, []);
    });

    // Create/recreate equipment shape
    const equipmentWhere = `inventory_id IN (${inventoryIds.map((id) => `'${id}'`).join(",")})`;

    const equipmentStream = new ShapeStream({
      url: `${electricUrl}/v1/shape`,
      params: {
        table: "equipment_instance",
        where: equipmentWhere,
      },
    });

    equipmentShape = new Shape(equipmentStream);

    equipmentShape.subscribe(({ value }) => {
      const items = Array.from(value.values()).map(
        (item) => item as unknown as typeof equipmentInstanceTable.$inferSelect,
      );
      upsertItemInstancesInGameState([], items);
    });
  }

  // Initialize character shape
  const characterStream = new ShapeStream({
    url: `${electricUrl}/v1/shape`,
    params: {
      table: "character",
      where: `area_id = '${area.id}' AND online = true`,
    },
  });

  characterShape = new Shape(characterStream);

  characterShape.subscribe(async ({ value }) => {
    await handleCharacterChanges(value);
  });

  logger.info(
    { electricUrl, areaId: area.id },
    "Electric sync session started",
  );

  // Do initial save
  await save();

  // Return session controller
  return {
    save,
    stop() {
      logger.info("Stopping Electric sync session");
      // Electric shapes clean up automatically when garbage collected
      // but we set to null to help with cleanup
      characterShape = null;
      consumableShape = null;
      equipmentShape = null;
    },
    flush() {
      // For Electric mode, flush means saving current state
      void save();
    },
  };
}

/**
 * Starts a database synchronization session.
 *
 * If Electric URL is configured, this creates a persistent sync session with real-time updates.
 * Otherwise, it uses the traditional polling approach for backwards compatibility.
 *
 * This is the recommended way to create a sync session as it handles both Electric and polling modes.
 */
export async function startSyncSession(
  drizzle: DrizzleClient,
  options: SyncGameStateOptions,
): Promise<SyncGameStateSession> {
  const { electricUrl, logger } = options;

  // If Electric URL is provided, use real-time sync
  if (electricUrl) {
    try {
      const session = await createElectricSyncSession(drizzle, {
        ...options,
        electricUrl,
      } as Required<Omit<SyncGameStateOptions, "electricUrl">> & {
        electricUrl: string;
      });
      logger.info("Using Electric real-time sync");
      return session;
    } catch (error) {
      logger.error(
        error,
        "Failed to initialize Electric sync, falling back to polling",
      );
      // Fall through to polling mode
    }
  }

  // Polling mode - create a session that polls periodically
  logger.info("Using polling-based sync");

  const syncInterval = TimeSpan.fromSeconds(5);
  const pollingSession = startAsyncInterval(async () => {
    const result = await syncGameState(drizzle, options);
    if (result.isErr()) {
      logger.error(result.error, "game state db sync error");
    }
  }, syncInterval);

  return {
    async save() {
      // In polling mode, save happens automatically on the next interval
      // But we can trigger an immediate sync
      const result = await syncGameState(drizzle, options);
      if (result.isErr()) {
        throw result.error;
      }
    },
    stop() {
      logger.info("Stopping polling sync session");
      pollingSession.stop();
    },
    flush() {
      // Flush the polling interval to trigger immediate sync
      void pollingSession.flush();
    },
  };
}
