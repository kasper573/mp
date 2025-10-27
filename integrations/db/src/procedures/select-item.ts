import assert from "assert";
import { eq } from "drizzle-orm";
import { DbClient } from "../client";
import { consumableDefinitionTable, equipmentDefinitionTable } from "../schema";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/game-shared";
import { safeDbOperation } from "../safe-db";
import type { ResultAsync } from "@mp/std";

export async function selectConsumableDefinition(
  db: DbClient,
  id: ConsumableDefinitionId,
) {
  const drizzle = DbClient.unwrap(db);
  const [def] = await drizzle
    .select()
    .from(consumableDefinitionTable)
    .where(eq(consumableDefinitionTable.id, id))
    .limit(1);

  assert(def, `Could not find consumable by id ${id}`);
  return def;
}

export async function selectEquipmentDefinition(
  db: DbClient,
  id: EquipmentDefinitionId,
) {
  const drizzle = DbClient.unwrap(db);
  const [def] = await drizzle
    .select()
    .from(equipmentDefinitionTable)
    .where(eq(equipmentDefinitionTable.id, id))
    .limit(1);

  assert(def, `Could not find equipment by id ${id}`);
  return def;
}

/**
 * Safe version that returns Result type for explicit error handling.
 * This is the recommended way to interact with database operations.
 */
export function selectConsumableDefinitionSafe(
  db: DbClient,
  id: ConsumableDefinitionId,
): ResultAsync<typeof consumableDefinitionTable.$inferSelect, Error> {
  return safeDbOperation(db, async (drizzle) => {
    const [def] = await drizzle
      .select()
      .from(consumableDefinitionTable)
      .where(eq(consumableDefinitionTable.id, id))
      .limit(1);

    if (!def) {
      throw new Error(`Could not find consumable by id ${id}`);
    }
    return def;
  });
}

/**
 * Safe version that returns Result type for explicit error handling.
 * This is the recommended way to interact with database operations.
 */
export function selectEquipmentDefinitionSafe(
  db: DbClient,
  id: EquipmentDefinitionId,
): ResultAsync<typeof equipmentDefinitionTable.$inferSelect, Error> {
  return safeDbOperation(db, async (drizzle) => {
    const [def] = await drizzle
      .select()
      .from(equipmentDefinitionTable)
      .where(eq(equipmentDefinitionTable.id, id))
      .limit(1);

    if (!def) {
      throw new Error(`Could not find equipment by id ${id}`);
    }
    return def;
  });
}
