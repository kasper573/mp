/*
 * ⚠️ THIS FILE NEEDS TO BE MIGRATED TO GEL QUERY BUILDER
 *
 * This file handles real-time database synchronization and is currently
 * non-functional because it uses Drizzle ORM syntax.
 *
 * To complete the migration:
 * 1. Migrate all database queries to use Gel query builder
 * 2. Update transaction handling for EdgeDB
 * 3. Migrate all select/insert/update operations
 *
 * For now, this returns a no-op function to avoid build errors.
 */

import type { DbClient } from "@mp/db";
import type {
  ActorModelLookup,
  AreaResource,
  GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { Rng } from "@mp/std";
import type { GameStateServer } from "./game-state-server";

export function gameStateDbSyncBehavior(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  area: AreaResource,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  state: GameState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  server: GameStateServer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  actorModels: ActorModelLookup,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rng: Rng,
  logger: Logger,
) {
  logger.warn("gameStateDbSyncBehavior is not yet migrated to Gel/EdgeDB");

  // Return a no-op dispose function
  return () => {
    // No cleanup needed
  };
}

/* ORIGINAL DRIZZLE CODE - TO BE MIGRATED

This file contained complex real-time sync logic that needs to be migrated
to EdgeDB query builder. The original implementation:

1. Polled database for character state changes
2. Synchronized game state with database
3. Handled item instances (consumables and equipment)
4. Used transactions for atomic updates

Key functions to migrate:
- sync() - Main sync function
- load() - Load changes from database to game state
- save() - Save game state to database
- getOnlineCharacterIdsForAreaFromDb() - Query online characters
- addCharacterToGameState() - Add character from DB
- removeCharacterFromGameState() - Remove character
- upsertItemInstancesInGameState() - Sync item instances

Migration required for:
- All SELECT queries → e.select(e.Type, ...)
- All UPDATE queries → e.update(e.Type, ...)
- All INSERT queries → e.insert(e.Type, ...)
- Transaction handling → client.transaction(...)
- Filter operations → e.op(...)
- Array operations → Convert inArray to e.op(..., 'in', ...)

See MIGRATION_GUIDE.md for query patterns.

*/
