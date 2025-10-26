import type { ItemDefinition } from "@mp/game-shared";
import { DbClient } from "../client";
import { equipmentDefinitionTable, consumableDefinitionTable } from "../schema";
import {
  equipmentDefinitionFromDbFields,
  consumableDefinitionFromDbFields,
} from "../transform";

export async function selectAllItemDefinitions(
  db: DbClient,
): Promise<ItemDefinition[]> {
  const drizzle = DbClient.unwrap(db);
  const [equipmentRows, consumableRows] = await Promise.all([
    drizzle.select().from(equipmentDefinitionTable),
    drizzle.select().from(consumableDefinitionTable),
  ]);

  return [
    ...equipmentRows.map(equipmentDefinitionFromDbFields),
    ...consumableRows.map(consumableDefinitionFromDbFields),
  ];
}
