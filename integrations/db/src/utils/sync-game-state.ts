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
import { eq } from "drizzle-orm";
import {
  characterTable,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "../schema";
import { dbFieldsFromCharacter, characterFromDbFields } from "./transform";
import type { CharacterId } from "@mp/game-shared";
import type { DrizzleClient } from "./client";
import { Shape, ShapeStream } from "@electric-sql/client";

// Type definitions for Electric Shape data
type CharacterRow = typeof characterTable.$inferSelect;
type ConsumableRow = typeof consumableInstanceTable.$inferSelect;
type EquipmentRow = typeof equipmentInstanceTable.$inferSelect;

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
   * Dispose the sync session and clean up resources
   */
  dispose: () => void;
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
 * Starts a database synchronization session using Electric SQL for real-time updates.
 *
 * This creates persistent Shape subscriptions that receive push notifications from Electric.
 * Writes are done directly to the database via Drizzle ORM, and Electric syncs them to other instances.
 */
export async function startSyncSession(
  drizzle: DrizzleClient,
  options: SyncGameStateOptions,
): Promise<SyncGameStateSession> {
  const {
    area,
    state,
    actorModels,
    logger,
    markToResendFullState,
    electricUrl,
  } = options;

  let characterShape: Shape<CharacterRow> | null = null;
  let consumableShape: Shape<ConsumableRow> | null = null;
  let equipmentShape: Shape<EquipmentRow> | null = null;

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
    dbConsumables: ConsumableRow[],
    dbEquipment: EquipmentRow[],
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

  function addCharacterToGameState(characterFields: CharacterRow) {
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
  function handleCharacterChanges(charactersData: Map<string, CharacterRow>) {
    const dbIds = new Set(charactersData.keys());
    const stateIds = characterIdsInState(state);
    const removedIds = stateIds.difference(dbIds);
    const addedIds = dbIds.difference(stateIds);

    // Remove characters that are no longer in the DB
    removedIds.forEach(removeCharacterFromGameState);

    // Add new characters from Electric data
    for (const characterId of addedIds) {
      const characterFields = charactersData.get(characterId);
      if (characterFields) {
        addCharacterToGameState(characterFields);
      }
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
    const consumableStream = new ShapeStream<ConsumableRow>({
      url: `${electricUrl}/v1/shape`,
      params: {
        table: "consumable_instance",
        where: `inventory_id IN (${inventoryIds.map((id) => `'${id}'`).join(",")})`,
      },
    });

    consumableShape = new Shape(consumableStream);

    consumableShape.subscribe(({ value }) => {
      const items = Array.from(value.values());
      upsertItemInstancesInGameState(items, []);
    });

    // Create/recreate equipment shape
    const equipmentStream = new ShapeStream<EquipmentRow>({
      url: `${electricUrl}/v1/shape`,
      params: {
        table: "equipment_instance",
        where: `inventory_id IN (${inventoryIds.map((id) => `'${id}'`).join(",")})`,
      },
    });

    equipmentShape = new Shape(equipmentStream);

    equipmentShape.subscribe(({ value }) => {
      const items = Array.from(value.values());
      upsertItemInstancesInGameState([], items);
    });
  }

  // Initialize character shape
  const characterStream = new ShapeStream<CharacterRow>({
    url: `${electricUrl}/v1/shape`,
    params: {
      table: "character",
      where: `area_id = '${area.id}' AND online = true`,
    },
  });

  characterShape = new Shape(characterStream);

  characterShape.subscribe(({ value }) => {
    handleCharacterChanges(value);
  });

  // Do initial save
  await save();

  // Return session controller
  return {
    dispose() {
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
