import assert from "assert";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { consumableDefinitionTable, equipmentDefinitionTable } from "../schema";
import type { ConsumableDefinitionId, EquipmentDefinitionId } from "../types";

export async function selectConsumableDefinition(
  db: DbClient,
  id: ConsumableDefinitionId,
) {
  const [def] = await db
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
  const [def] = await db
    .select()
    .from(equipmentDefinitionTable)
    .where(eq(equipmentDefinitionTable.id, id))
    .limit(1);

  assert(def, `Could not find equipment by id ${id}`);
  return def;
}
