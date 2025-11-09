import { createDrizzleClient } from "./utils/client";
import { mayAccessCharacter } from "./procedures/may-access-character";
import { selectAllActorModelIds } from "./procedures/select-all-actor-model-ids";
import { selectAllItemDefinitions } from "./procedures/select-all-item-definitions";
import { selectAllNpcRewards } from "./procedures/select-all-npc-rewards";
import { selectAllSpawnAndNpcPairs } from "./procedures/select-all-spawn-and-npc-pairs";
import {
  selectConsumableDefinition,
  selectEquipmentDefinition,
} from "./procedures/select-item";
import { selectOnlineCharacterList } from "./procedures/select-online-character-list";
import { selectOrCreateCharacterIdForUser } from "./procedures/select-or-create-character-id";
import { updateCharactersArea } from "./procedures/update-characters-area";
import { updateOnlineCharacters } from "./procedures/update-online-characters";
import { upsertCharacter } from "./procedures/upsert-character";
import type {
  SyncGameStateOptions,
  SyncGameStateSession,
} from "./utils/sync-game-state";
import { syncGameState, startSyncSession } from "./utils/sync-game-state";

/**
 * All database interactions must be done through the repository.
 * We separate query definitions into procedures internally in the db package,
 * but only the repository will be exposed outside the package.
 */
export function createDbRepository(
  connectionString: string,
  electricUrl?: string,
) {
  const drizzle = createDrizzleClient(connectionString);

  return {
    mayAccessCharacter: mayAccessCharacter.build(drizzle),
    selectAllActorModelIds: selectAllActorModelIds.build(drizzle),
    selectAllItemDefinitions: selectAllItemDefinitions.build(drizzle),
    selectAllNpcRewards: selectAllNpcRewards.build(drizzle),
    selectAllSpawnAndNpcPairs: selectAllSpawnAndNpcPairs.build(drizzle),
    selectConsumableDefinition: selectConsumableDefinition.build(drizzle),
    selectEquipmentDefinition: selectEquipmentDefinition.build(drizzle),
    selectOnlineCharacterList: selectOnlineCharacterList.build(drizzle),
    selectOrCreateCharacterIdForUser:
      selectOrCreateCharacterIdForUser.build(drizzle),
    updateCharactersArea: updateCharactersArea.build(drizzle),
    updateOnlineCharacters: updateOnlineCharacters.build(drizzle),
    upsertCharacter: upsertCharacter.build(drizzle),

    syncGameState: (options: SyncGameStateOptions) =>
      syncGameState(drizzle, { ...options, electricUrl }),

    startSyncSession: (options: SyncGameStateOptions) =>
      startSyncSession(drizzle, { ...options, electricUrl }),

    subscribeToErrors(handler: (error: Error) => unknown) {
      drizzle.$client.on("error", handler);
      return () => drizzle.$client.off("error", handler);
    },

    dispose() {
      return drizzle.$client.end();
    },
  };
}

export type { SyncGameStateOptions, SyncGameStateSession };

export type DbRepository = ReturnType<typeof createDbRepository>;
