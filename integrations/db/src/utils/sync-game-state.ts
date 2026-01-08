import type {
  GameState,
  ActorModelLookup,
  ItemInstanceId,
  ItemInstance,
  Character,
  InventoryId,
  AreaId,
} from "@mp/game-shared";
import { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { assert, ResultAsync } from "@mp/std";
import { inArray, eq, and } from "drizzle-orm";
import {
  characterTable,
  consumableInstanceTable,
  equipmentInstanceTable,
} from "../schema";
import { dbFieldsFromCharacter, characterFromDbFields } from "./transform";
import type { CharacterId } from "@mp/game-shared";
import type { DrizzleClient } from "./client";

export interface GameStateSyncOptions {
  areaId: AreaId;
  state: GameState;
  actorModels: ActorModelLookup;
  logger: Logger;
  markToResendFullState: (characterId: CharacterId) => void;
  getOnlineCharacterIds: () => CharacterId[];
}

/**
 * Queries the database for game state changes and updates the game state accordingly.
 * Only adds and removes are applied. Db updates to entities that already exist in game state will be ignored.
 *
 * This means external systems cannot really reliably update game state tables in the db,
 * since those changes may be overwritten by game services.
 * This is an intentional limitation to keep the sync system simple.
 * If we ever need external systems to manipiulate persisted game state we'll have to look into more robust sync mechanisms.
 */
export class GameStateSync {
  constructor(
    private drizzle: DrizzleClient,
    private opt: GameStateSyncOptions,
  ) {}
  sync = () => ResultAsync.fromPromise(this.save().then(this.load), (e) => e);

  private load = () => loadGameStateForAllCharacters(this.drizzle, this.opt);

  private save = () =>
    saveGameStateForCharacters(this.drizzle, this.opt.state, () => true);

  loadOne = (characterId: CharacterId) =>
    ResultAsync.fromPromise(
      loadGameStateForOneCharacter(this.drizzle, this.opt, characterId),
      (e) => e,
    );

  saveOne = (characterId: CharacterId) =>
    ResultAsync.fromPromise(
      saveGameStateForCharacters(
        this.drizzle,
        this.opt.state,
        (char) => char.identity.id === characterId,
      ),
      (e) => e,
    );
}

async function loadGameStateForAllCharacters(
  drizzle: DrizzleClient,
  opt: GameStateSyncOptions,
) {
  const dbIds = await getOnlineCharacterIdsForArea(
    drizzle,
    opt.areaId,
    opt.getOnlineCharacterIds(),
  );
  const stateIds = characterIdsInState(opt.state);
  const removedIds = stateIds.difference(dbIds);
  const addedIds = dbIds.difference(stateIds);

  removedIds.forEach((id) => removeCharacterFromGameState(id, opt));

  if (addedIds.size) {
    const addedCharacters = await drizzle
      .select()
      .from(characterTable)
      .where(inArray(characterTable.id, addedIds.values().toArray()));

    addedCharacters.forEach((id) => addCharacterToGameState(id, opt));
  }

  await loadInventories(drizzle, opt.state);
}

async function loadGameStateForOneCharacter(
  drizzle: DrizzleClient,
  opt: GameStateSyncOptions,
  forCharacterId: CharacterId,
) {
  const dbCharacter = await getCharacterDataIfOnlineInArea(
    drizzle,
    opt.areaId,
    forCharacterId,
    opt.getOnlineCharacterIds(),
  );

  if (!dbCharacter) {
    // Db says this character should not be in this area anymore
    if (opt.state.actors.has(forCharacterId)) {
      removeCharacterFromGameState(forCharacterId, opt);
    }
    return;
  }

  if (opt.state.actors.has(forCharacterId)) {
    // Already in game state, trust the existing state to be more up to date than the db
    return;
  }

  // We should add the character to game state according to the db
  addCharacterToGameState(dbCharacter, opt);

  const forCharacter = assert(
    opt.state.actors.get(forCharacterId),
  ) as Character;

  await loadInventories(
    drizzle,
    opt.state,
    new Set([forCharacter.inventoryId]),
  );
}

function saveGameStateForCharacters(
  drizzle: DrizzleClient,
  state: GameState,
  characterFilter: (char: Character) => boolean,
) {
  return drizzle.transaction(async (tx) => {
    await Promise.all(
      state.actors
        .values()
        .filter(
          (actor): actor is Character =>
            actor.type === "character" && characterFilter(actor),
        )
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

async function loadInventories(
  drizzle: DrizzleClient,
  state: GameState,
  inventoryIds?: ReadonlySet<InventoryId>,
) {
  if (!inventoryIds) {
    inventoryIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.inventoryId] : [])),
    );
  }

  const [consumableInstanceFields, equipmentInstanceFields] = await Promise.all(
    [
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
    ],
  );

  upsertItemInstancesInGameState(
    state,
    consumableInstanceFields,
    equipmentInstanceFields,
  );
}

function addCharacterToGameState(
  characterFields: typeof characterTable.$inferSelect,
  opt: GameStateSyncOptions,
) {
  const char = characterFromDbFields(characterFields, opt.actorModels);
  opt.state.actors.set(char.identity.id, char);
  opt.markToResendFullState(char.identity.id);
  opt.logger.debug(
    { characterId: characterFields.id },
    "Character joined game service via db sync",
  );
}

function removeCharacterFromGameState(
  characterId: CharacterId,
  opt: GameStateSyncOptions,
) {
  const char = opt.state.actors.get(characterId) as Character | undefined;
  opt.state.actors.delete(characterId);
  for (const item of opt.state.items.values()) {
    if (item.inventoryId === char?.inventoryId) {
      opt.state.items.delete(item.id);
    }
  }
  opt.logger.debug({ characterId }, "Character left game service via db sync");
}

function upsertItemInstancesInGameState(
  state: GameState,
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
    }
  }
}

async function getOnlineCharacterIdsForArea(
  drizzle: DrizzleClient,
  areaId: AreaId,
  onlineCharacterIds: CharacterId[],
): Promise<ReadonlySet<CharacterId>> {
  return new Set(
    (
      await drizzle
        .select({ id: characterTable.id })
        .from(characterTable)
        .where(
          and(
            eq(characterTable.areaId, areaId),
            inArray(characterTable.id, onlineCharacterIds),
          ),
        )
    ).map((row) => row.id),
  );
}

async function getCharacterDataIfOnlineInArea(
  drizzle: DrizzleClient,
  areaId: AreaId,
  characterId: CharacterId,
  onlineCharacterIds: CharacterId[],
) {
  if (!onlineCharacterIds.includes(characterId)) {
    return;
  }

  const res = await drizzle
    .select()
    .from(characterTable)
    .where(
      and(
        eq(characterTable.areaId, areaId),
        eq(characterTable.id, characterId),
      ),
    )
    .limit(1);

  if (!res.length) {
    return;
  }

  return res[0];
}

function characterIdsInState(state: GameState): ReadonlySet<CharacterId> {
  return new Set(
    state.actors
      .values()
      .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
  );
}
