import type { ItemDefinition } from "@mp/game-shared";
import type { DbClient } from "../client";
import { equipmentDefinitionTable, consumableDefinitionTable } from "../schema";
import {
  equipmentDefinitionFromDbFields,
  consumableDefinitionFromDbFields,
} from "../transform";

export async function selectAllItemDefinitions(
  db: DbClient,
): Promise<ItemDefinition[]> {
  const [equipmentRows, consumableRows] = await Promise.all([
    db.select().from(equipmentDefinitionTable),
    db.select().from(consumableDefinitionTable),
  ]);

  return [
    ...equipmentRows.map(equipmentDefinitionFromDbFields),
    ...consumableRows.map(consumableDefinitionFromDbFields),
  ];
}
