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
import { inArray, eq } from "drizzle-orm";
import {
  characterTable,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "../schema";
import { dbFieldsFromCharacter, characterFromDbFields } from "./transform";
import type { CharacterId } from "@mp/game-shared";
import type { DrizzleClient } from "./client";
import { Shape, ShapeStream } from "@electric-sql/client";

export interface SyncGameStateOptions {
  area: AreaResource;
  state: GameState;
  actorModels: ActorModelLookup;
  logger: Logger;
  markToResendFullState: (characterId: CharacterId) => void;
  electricUrl: string;
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
   * @param character Only flush data related to this character. If omitted, flushes all pending data.
   */
  flush: (character?: Character) => void;
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
    flush(_character?: Character) {
      // For Electric mode, flush means saving current state
      // Character parameter is for future proofing but not used currently
      void save();
    },
  };
}

/**
 * Starts a database synchronization session using Electric SQL for real-time updates.
 *
 * This creates persistent Shape subscriptions that receive push notifications from Electric.
 * Writes are done directly to the database via Drizzle ORM.
 */
export async function startSyncSession(
  drizzle: DrizzleClient,
  options: SyncGameStateOptions,
): Promise<SyncGameStateSession> {
  const { electricUrl, logger } = options;

  logger.info({ electricUrl }, "Starting Electric real-time sync session");

  const session = await createElectricSyncSession(drizzle, options);

  return session;
}
